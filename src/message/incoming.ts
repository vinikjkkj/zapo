import type { WaIncomingMessageEvent, WaIncomingUnhandledStanzaEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import { unwrapDeviceSentMessage } from '@message/device-sent'
import { unpadPkcs7 } from '@message/padding'
import { proto } from '@proto'
import { WA_MESSAGE_TAGS, WA_MESSAGE_TYPES } from '@protocol/constants'
import { isBroadcastJid, isGroupJid, parseSignalAddressFromJid } from '@protocol/jid'
import type { WaRetryDecryptFailureContext } from '@retry/types'
import type { SenderKeyManager } from '@signal/group/SenderKeyManager'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress } from '@signal/types'
import { buildAckNode, buildReceiptNode } from '@transport/node/builders/global'
import { decodeNodeContentBase64OrBytes, findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt, toError } from '@util/primitives'

interface WaIncomingMessageAckHandlerOptions {
    readonly logger: Logger
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly getMeJid?: () => string | null | undefined
    readonly signalProtocol?: SignalProtocol
    readonly senderKeyManager?: SenderKeyManager
    readonly onDecryptFailure?: (
        context: WaRetryDecryptFailureContext,
        error: unknown
    ) => Promise<boolean>
    readonly emitIncomingMessage?: (event: WaIncomingMessageEvent) => void
    readonly emitUnhandledStanza?: (event: WaIncomingUnhandledStanzaEvent) => void
}

function parseMessageTimestamp(value: string | undefined): number | undefined {
    return parseOptionalInt(value)
}

function pickNextRetryCount(node: BinaryNode): number {
    const retryNode = findNodeChild(node, 'retry')
    const parsed = parseOptionalInt(retryNode?.attrs.count)
    if (!parsed || parsed < 1) {
        return 1
    }
    return parsed + 1
}

function buildIncomingEventRawNode(node: BinaryNode): BinaryNode {
    const nodeContent = node.content
    if (!Array.isArray(nodeContent) || nodeContent.length === 0) {
        return node
    }

    let children: BinaryNode[] | null = null
    for (let index = 0; index < nodeContent.length; index += 1) {
        const child = nodeContent[index]
        const shouldRedact =
            child.tag === WA_MESSAGE_TAGS.ENC &&
            (typeof child.content === 'string' || child.content instanceof Uint8Array)
        if (!shouldRedact) {
            if (children) {
                children.push(child)
            }
            continue
        }
        if (!children) {
            children = nodeContent.slice(0, index)
        }
        children.push({
            tag: child.tag,
            attrs: child.attrs
        })
    }
    if (!children) {
        return node
    }
    // Strip heavy encrypted payload from event snapshots to reduce retention.
    return {
        tag: node.tag,
        attrs: node.attrs,
        content: children
    }
}

function buildBaseIncomingEvent(node: BinaryNode): {
    readonly rawNode: BinaryNode
    readonly stanzaId?: string
    readonly chatJid?: string
    readonly stanzaType?: string
} {
    return {
        rawNode: buildIncomingEventRawNode(node),
        stanzaId: node.attrs.id,
        chatJid: node.attrs.from,
        stanzaType: node.attrs.type
    }
}

function pickSenderKeyDistributionPayload(
    message: proto.IMessage
): { readonly groupId: string; readonly payload: Uint8Array } | null {
    const direct = pickDirectSenderKeyDistributionPayload(message)
    if (direct) {
        return direct
    }

    const nestedMessage = message.deviceSentMessage?.message ?? undefined
    if (nestedMessage) {
        return pickSenderKeyDistributionPayload(nestedMessage)
    }

    return null
}

function pickDirectSenderKeyDistributionPayload(
    message: proto.IMessage
): { readonly groupId: string; readonly payload: Uint8Array } | null {
    const senderKeyDistribution = message.senderKeyDistributionMessage
    if (
        senderKeyDistribution?.groupId &&
        senderKeyDistribution.axolotlSenderKeyDistributionMessage
    ) {
        return {
            groupId: senderKeyDistribution.groupId,
            payload: senderKeyDistribution.axolotlSenderKeyDistributionMessage
        }
    }

    const fastRatchetSenderKeyDistribution = message.fastRatchetKeySenderKeyDistributionMessage
    if (
        fastRatchetSenderKeyDistribution?.groupId &&
        fastRatchetSenderKeyDistribution.axolotlSenderKeyDistributionMessage
    ) {
        return {
            groupId: fastRatchetSenderKeyDistribution.groupId,
            payload: fastRatchetSenderKeyDistribution.axolotlSenderKeyDistributionMessage
        }
    }

    return null
}

function shouldEmitIncomingMessage(message: proto.IMessage): boolean {
    if (!pickDirectSenderKeyDistributionPayload(message)) {
        return true
    }
    const messageRecord = message as Record<string, unknown>
    for (const field in messageRecord) {
        if (
            field === 'senderKeyDistributionMessage' ||
            field === 'fastRatchetKeySenderKeyDistributionMessage' ||
            field === '$$unknownFieldCount'
        ) {
            continue
        }
        const value = messageRecord[field]
        if (value === null || value === undefined) {
            continue
        }
        return true
    }
    return false
}

async function sendRetryReceiptForDecryptFailure(
    node: BinaryNode,
    options: WaIncomingMessageAckHandlerOptions,
    error: unknown,
    encType: string
): Promise<boolean> {
    const stanzaId = node.attrs.id
    const from = node.attrs.from
    if (!stanzaId || !from) {
        return false
    }

    const retryContext: WaRetryDecryptFailureContext = {
        messageNode: node,
        stanzaId,
        from,
        participant: node.attrs.participant,
        recipient: node.attrs.recipient,
        t: node.attrs.t
    }

    if (options.onDecryptFailure) {
        return options.onDecryptFailure(retryContext, error)
    }

    const retryReceiptNode = buildReceiptNode({
        kind: 'retry',
        node,
        id: stanzaId,
        to: from,
        retryCount: pickNextRetryCount(node)
    })
    try {
        await options.sendNode(retryReceiptNode)
        options.logger.debug('sent retry receipt for undecryptable incoming message', {
            id: stanzaId,
            to: from,
            participant: retryReceiptNode.attrs.participant,
            encType
        })
        return true
    } catch (retryError) {
        options.logger.warn('failed to send retry receipt for incoming message', {
            id: stanzaId,
            from,
            participant: node.attrs.participant,
            encType,
            message: toError(retryError).message
        })
        return false
    }
}

interface DecryptEncNodeResult {
    readonly success: boolean
    readonly encType: string
    readonly error?: unknown
}

async function decryptAndProcessEncNode(
    node: BinaryNode,
    encNode: BinaryNode,
    encType: string,
    senderJid: string,
    options: WaIncomingMessageAckHandlerOptions,
    decrypt: (ciphertext: Uint8Array, senderAddress: SignalAddress) => Promise<Uint8Array>
): Promise<DecryptEncNodeResult> {
    try {
        const senderAddress = parseSignalAddressFromJid(senderJid)
        const decryptedPayload = await decrypt(
            decodeNodeContentBase64OrBytes(encNode.content, 'message.enc'),
            senderAddress
        )
        const unpaddedPlaintext = unpadPkcs7(decryptedPayload)
        const message = normalizeIncomingDecryptedMessage(proto.Message.decode(unpaddedPlaintext))
        const senderKeyDistribution = pickSenderKeyDistributionPayload(message)
        if (senderKeyDistribution && options.senderKeyManager) {
            try {
                await options.senderKeyManager.processSenderKeyDistributionPayload(
                    senderKeyDistribution.groupId,
                    senderAddress,
                    senderKeyDistribution.payload
                )
                options.logger.debug('processed incoming sender key distribution', {
                    id: node.attrs.id,
                    from: node.attrs.from,
                    participant: node.attrs.participant,
                    groupId: senderKeyDistribution.groupId
                })
            } catch (error) {
                options.logger.warn('failed to process incoming sender key distribution', {
                    id: node.attrs.id,
                    from: node.attrs.from,
                    participant: node.attrs.participant,
                    groupId: senderKeyDistribution.groupId,
                    message: toError(error).message
                })
            }
        }
        if (shouldEmitIncomingMessage(message)) {
            const chatJid = node.attrs.from
            options.emitIncomingMessage?.({
                ...buildBaseIncomingEvent(node),
                timestampSeconds: parseMessageTimestamp(node.attrs.t),
                senderJid,
                encryptionType: encType,
                isGroupChat: chatJid ? isGroupJid(chatJid) : false,
                isBroadcastChat: chatJid ? isBroadcastJid(chatJid) : false,
                plaintext: unpaddedPlaintext,
                message
            })
        }
        return { success: true, encType }
    } catch (error) {
        options.logger.warn('failed to decrypt incoming message', {
            id: node.attrs.id,
            from: node.attrs.from,
            participant: node.attrs.participant,
            encType,
            message: toError(error).message
        })
        options.emitUnhandledStanza?.({
            ...buildBaseIncomingEvent(node),
            reason: `message.decrypt_failed.${encType}`
        })
        return { success: false, encType, error }
    }
}

export async function handleIncomingMessageAck(
    node: BinaryNode,
    options: WaIncomingMessageAckHandlerOptions
): Promise<boolean> {
    if (node.tag !== WA_MESSAGE_TAGS.MESSAGE) {
        return false
    }

    let shouldSendStandardReceipt = true
    const nodeContent = node.content
    if (Array.isArray(nodeContent) && nodeContent.length > 0) {
        const senderJid = node.attrs.participant ?? node.attrs.from
        let hasSuccessfulDecrypt = false
        let firstDecryptFailure: DecryptEncNodeResult | null = null
        let encCount = 0
        let firstEncType: string | undefined

        for (const child of nodeContent) {
            if (child.tag !== WA_MESSAGE_TAGS.ENC) {
                continue
            }
            encCount += 1
            if (firstEncType === undefined) {
                firstEncType = child.attrs.type
            }
            let result: DecryptEncNodeResult | null = null
            switch (child.attrs.type) {
                case 'skmsg': {
                    if (!senderJid || !node.attrs.from || !options.senderKeyManager) {
                        options.emitUnhandledStanza?.({
                            ...buildBaseIncomingEvent(node),
                            reason: 'message.skmsg.missing_group_context'
                        })
                        continue
                    }
                    const groupId = node.attrs.from
                    result = await decryptAndProcessEncNode(
                        node,
                        child,
                        'skmsg',
                        senderJid,
                        options,
                        (ciphertext, senderAddress) =>
                            options.senderKeyManager!.decryptGroupMessage({
                                groupId,
                                sender: senderAddress,
                                ciphertext
                            })
                    )
                    break
                }
                case 'msg':
                case 'pkmsg': {
                    if (!senderJid || !options.signalProtocol) {
                        continue
                    }
                    const encType: 'msg' | 'pkmsg' = child.attrs.type === 'msg' ? 'msg' : 'pkmsg'
                    result = await decryptAndProcessEncNode(
                        node,
                        child,
                        encType,
                        senderJid,
                        options,
                        (ciphertext, senderAddress) =>
                            options.signalProtocol!.decryptMessage(senderAddress, {
                                type: encType,
                                ciphertext
                            })
                    )
                    break
                }
                default:
                    continue
            }
            if (result.success) hasSuccessfulDecrypt = true
            else if (!firstDecryptFailure) firstDecryptFailure = result
        }

        if (encCount > 1 && firstEncType === 'skmsg') {
            options.logger.warn('incoming message enc order is unexpected: skmsg first', {
                id: node.attrs.id,
                from: node.attrs.from,
                participant: node.attrs.participant,
                encCount
            })
        }
        if (encCount > 0 && !hasSuccessfulDecrypt && firstDecryptFailure) {
            shouldSendStandardReceipt = !(await sendRetryReceiptForDecryptFailure(
                node,
                options,
                firstDecryptFailure.error,
                firstDecryptFailure.encType
            ))
        }
    }

    const id = node.attrs.id
    const from = node.attrs.from
    if (!id || !from) {
        options.logger.warn('incoming message missing required attrs for ack/receipt', {
            hasId: Boolean(id),
            hasFrom: Boolean(from),
            type: node.attrs.type
        })
        return true
    }

    if (node.attrs.type === WA_MESSAGE_TYPES.MEDIA_NOTIFY) {
        const ackNode = buildAckNode({
            kind: 'message',
            node,
            id,
            to: from,
            from: options.getMeJid?.()
        })
        options.logger.debug('sending inbound message ack', {
            id,
            to: from,
            type: ackNode.attrs.type,
            participant: ackNode.attrs.participant
        })
        await options.sendNode(ackNode)
        return true
    }

    if (!shouldSendStandardReceipt) {
        return true
    }

    const receiptNode = buildReceiptNode({
        kind: 'delivery',
        node,
        id,
        to: from
    })
    options.logger.debug('sending inbound message receipt', {
        id,
        to: from,
        type: receiptNode.attrs.type,
        participant: receiptNode.attrs.participant
    })
    await options.sendNode(receiptNode)
    return true
}

function normalizeIncomingDecryptedMessage(message: proto.IMessage): proto.IMessage {
    return unwrapDeviceSentMessage(message) ?? message
}
