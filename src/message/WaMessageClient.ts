import type { Logger } from '@infra/log/types'
import {
    describeAckNode,
    isAckOrReceiptNode,
    isNegativeAckNode,
    isRetryableNegativeAck
} from '@message/ack'
import type {
    WaMessageAckMetadata,
    WaEncryptedMessageInput,
    WaMessagePublishOptions,
    WaMessagePublishResult,
    WaSendReceiptInput
} from '@message/types'
import { WA_DEFAULTS, WA_MESSAGE_TAGS, WA_MESSAGE_TYPES, WA_NODE_TAGS } from '@protocol/constants'
import { buildReceiptNode } from '@transport/node/builders/global'
import type { BinaryNode } from '@transport/types'
import { delay } from '@util/async'
import { parseOptionalInt, toError } from '@util/primitives'

const WA_RETRYABLE_PUBLISH_ERROR_RE = /timeout|socket|connection|closed/i

interface WaMessageClientOptions {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
    readonly defaultAckTimeoutMs?: number
    readonly defaultMaxAttempts?: number
    readonly defaultRetryDelayMs?: number
}

class MessagePublishNackError extends Error {
    public readonly retryable: boolean

    public constructor(message: string, retryable: boolean) {
        super(message)
        this.name = 'MessagePublishNackError'
        this.retryable = retryable
    }
}

export class WaMessageClient {
    private readonly logger: WaMessageClientOptions['logger']
    private readonly sendNode: WaMessageClientOptions['sendNode']
    private readonly query: WaMessageClientOptions['query']
    private readonly defaultAckTimeoutMs: number
    private readonly defaultMaxAttempts: number
    private readonly defaultRetryDelayMs: number

    public constructor(options: WaMessageClientOptions) {
        this.logger = options.logger
        this.sendNode = options.sendNode
        this.query = options.query
        this.defaultAckTimeoutMs = options.defaultAckTimeoutMs ?? WA_DEFAULTS.MESSAGE_ACK_TIMEOUT_MS
        this.defaultMaxAttempts = options.defaultMaxAttempts ?? WA_DEFAULTS.MESSAGE_MAX_ATTEMPTS
        this.defaultRetryDelayMs = options.defaultRetryDelayMs ?? WA_DEFAULTS.MESSAGE_RETRY_DELAY_MS
    }

    public async publishNode(
        node: BinaryNode,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        if (node.tag !== WA_MESSAGE_TAGS.MESSAGE) {
            throw new Error(`invalid node tag for message publish: ${node.tag}`)
        }

        const ackTimeoutMs = options.ackTimeoutMs ?? this.defaultAckTimeoutMs
        const maxAttempts = options.maxAttempts ?? this.defaultMaxAttempts
        const retryDelayMs = options.retryDelayMs ?? this.defaultRetryDelayMs
        if (ackTimeoutMs < 1 || maxAttempts < 1 || retryDelayMs < 0) {
            throw new Error('invalid message publish options')
        }

        let lastError: Error | null = null
        for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
            try {
                this.logger.debug('message publish attempt', {
                    attempt,
                    maxAttempts,
                    to: node.attrs.to,
                    type: node.attrs.type,
                    id: node.attrs.id
                })
                const ackNode = await this.query(node, ackTimeoutMs)
                const id = ackNode.attrs.id
                if (!id) {
                    throw new Error('message publish ack node missing id')
                }
                if (!isAckOrReceiptNode(ackNode)) {
                    throw new Error(`unexpected publish response: ${describeAckNode(ackNode)}`)
                }
                if (isNegativeAckNode(ackNode)) {
                    throw new MessagePublishNackError(
                        `negative publish ack: ${describeAckNode(ackNode)}`,
                        isRetryableNegativeAck(ackNode)
                    )
                }
                this.logger.info('message publish acknowledged', {
                    id,
                    tag: ackNode.tag,
                    type: ackNode.attrs.type,
                    phash: ackNode.attrs.phash,
                    addressingMode: ackNode.attrs.addressing_mode,
                    attempts: attempt
                })
                return {
                    id,
                    attempts: attempt,
                    ackNode,
                    ack: this.extractAckMetadata(ackNode)
                }
            } catch (error) {
                lastError = toError(error)
                const nackRetryable =
                    error instanceof MessagePublishNackError ? error.retryable : false
                const canRetry =
                    attempt < maxAttempts &&
                    (this.isRetryablePublishError(lastError) || nackRetryable)
                this.logger.warn('message publish attempt failed', {
                    attempt,
                    maxAttempts,
                    canRetry,
                    nackRetryable,
                    message: lastError.message
                })
                if (!canRetry) {
                    throw lastError
                }
                await delay(retryDelayMs * attempt)
            }
        }

        throw lastError ?? new Error('message publish failed')
    }

    public async publishEncrypted(
        input: WaEncryptedMessageInput,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        const node = this.buildEncryptedMessageNode(input)
        return this.publishNode(node, options)
    }

    public async sendMessageNode(node: BinaryNode): Promise<void> {
        if (node.tag !== WA_MESSAGE_TAGS.MESSAGE) {
            throw new Error(`invalid node tag for message send: ${node.tag}`)
        }
        this.logger.debug('message sent without waiting for ack', {
            to: node.attrs.to,
            type: node.attrs.type,
            id: node.attrs.id
        })
        await this.sendNode(node)
    }

    public async sendEncrypted(input: WaEncryptedMessageInput): Promise<void> {
        const node = this.buildEncryptedMessageNode(input)
        await this.sendMessageNode(node)
    }

    private buildEncryptedMessageNode(input: WaEncryptedMessageInput): BinaryNode {
        const attrs: Record<string, string> = {
            to: input.to,
            type: input.type ?? 'text'
        }
        if (input.id) {
            attrs.id = input.id
        }
        if (input.category) {
            attrs.category = input.category
        }
        if (input.pushPriority) {
            attrs.push_priority = input.pushPriority
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        if (input.addressingMode) {
            attrs.addressing_mode = input.addressingMode
        }
        if (input.deviceFanout) {
            attrs.device_fanout = input.deviceFanout
        }
        const encAttrs: Record<string, string> = {
            v: WA_MESSAGE_TYPES.ENC_VERSION,
            type: input.encType
        }
        if (input.encCount !== undefined && input.encCount > 0) {
            encAttrs.count = String(Math.trunc(input.encCount))
        }
        const content: BinaryNode[] = [
            {
                tag: WA_MESSAGE_TAGS.ENC,
                attrs: encAttrs,
                content: input.ciphertext
            }
        ]
        if (input.deviceIdentity) {
            content.push({
                tag: WA_NODE_TAGS.DEVICE_IDENTITY,
                attrs: {},
                content: input.deviceIdentity
            })
        }
        const node: BinaryNode = {
            tag: WA_MESSAGE_TAGS.MESSAGE,
            attrs,
            content
        }
        return node
    }

    public async sendReceipt(input: WaSendReceiptInput): Promise<void> {
        const node = buildReceiptNode({
            kind: 'outbound',
            to: input.to,
            id: input.id,
            type: input.type ?? 'read',
            participant: input.participant,
            recipient: input.recipient,
            category: input.category,
            from: input.from,
            t: input.t,
            peerParticipantPn: input.peerParticipantPn,
            listIds: input.listIds,
            content: input.content ? [...input.content] : undefined
        })
        this.logger.debug('sending receipt node', {
            to: node.attrs.to,
            id: node.attrs.id,
            type: node.attrs.type
        })
        await this.sendNode(node)
    }

    private isRetryablePublishError(error: Error): boolean {
        return WA_RETRYABLE_PUBLISH_ERROR_RE.test(error.message)
    }

    private extractAckMetadata(ackNode: BinaryNode): WaMessageAckMetadata {
        const addressingModeRaw = ackNode.attrs.addressing_mode
        const addressingMode =
            addressingModeRaw === 'pn' || addressingModeRaw === 'lid'
                ? addressingModeRaw
                : undefined
        return {
            t: ackNode.attrs.t,
            sync: ackNode.attrs.sync,
            phash: ackNode.attrs.phash,
            refreshLid: ackNode.attrs.refresh_lid === 'true',
            addressingMode,
            count: parseOptionalInt(ackNode.attrs.count),
            error: parseOptionalInt(ackNode.attrs.error)
        }
    }
}
