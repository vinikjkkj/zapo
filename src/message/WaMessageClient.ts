import type { Logger } from '../infra/log/types'
import { WA_DEFAULTS, WA_MESSAGE_TAGS, WA_MESSAGE_TYPES } from '../protocol/constants'
import type { BinaryNode } from '../transport/types'
import { delay } from '../util/async'
import { toError } from '../util/primitives'

import {
    describeAckNode,
    isAckOrReceiptNode,
    isNegativeAckNode,
    isRetryableNegativeAck
} from './ack'
import type {
    WaEncryptedMessageInput,
    WaMessagePublishOptions,
    WaMessagePublishResult,
    WaSendReceiptInput
} from './types'

interface WaMessageClientOptions {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
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

    public constructor(options: WaMessageClientOptions) {
        this.logger = options.logger
        this.sendNode = options.sendNode
        this.query = options.query
    }

    public async publishNode(
        node: BinaryNode,
        options: WaMessagePublishOptions = {}
    ): Promise<WaMessagePublishResult> {
        if (node.tag !== WA_MESSAGE_TAGS.MESSAGE) {
            throw new Error(`invalid node tag for message publish: ${node.tag}`)
        }

        const ackTimeoutMs = options.ackTimeoutMs ?? WA_DEFAULTS.MESSAGE_ACK_TIMEOUT_MS
        const maxAttempts = options.maxAttempts ?? WA_DEFAULTS.MESSAGE_MAX_ATTEMPTS
        const retryDelayMs = options.retryDelayMs ?? WA_DEFAULTS.MESSAGE_RETRY_DELAY_MS
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
                    attempts: attempt
                })
                return {
                    id,
                    attempts: attempt,
                    ackNode
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
        const attrs: Record<string, string> = {
            to: input.to,
            type: input.type ?? 'text'
        }
        if (input.id) {
            attrs.id = input.id
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        if (input.deviceFanout) {
            attrs.device_fanout = input.deviceFanout
        }
        const node: BinaryNode = {
            tag: WA_MESSAGE_TAGS.MESSAGE,
            attrs,
            content: [
                {
                    tag: WA_MESSAGE_TAGS.ENC,
                    attrs: {
                        v: WA_MESSAGE_TYPES.ENC_VERSION,
                        type: input.encType
                    },
                    content: input.ciphertext
                }
            ]
        }
        return this.publishNode(node, options)
    }

    public async sendReceipt(input: WaSendReceiptInput): Promise<void> {
        const attrs: Record<string, string> = {
            to: input.to,
            id: input.id,
            type: input.type ?? 'read'
        }
        if (input.participant) {
            attrs.participant = input.participant
        }
        if (input.from) {
            attrs.from = input.from
        }
        if (input.t) {
            attrs.t = input.t
        }
        this.logger.debug('sending receipt node', {
            to: attrs.to,
            id: attrs.id,
            type: attrs.type
        })
        await this.sendNode({
            tag: WA_MESSAGE_TAGS.RECEIPT,
            attrs
        })
    }

    private isRetryablePublishError(error: Error): boolean {
        const message = error.message.toLowerCase()
        return (
            message.includes('timeout') ||
            message.includes('socket') ||
            message.includes('connection') ||
            message.includes('closed')
        )
    }
}
