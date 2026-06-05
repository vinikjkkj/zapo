import type {
    WaIncomingMessageEvent,
    WaIncomingNewsletterMessageUpdateEvent,
    WaIncomingUnhandledStanzaEvent
} from '@client/types'
import type { Logger } from '@infra/log/types'
import { pickIncomingExpirationSeconds } from '@message/context-info'
import { unwrapDeviceSentMessage } from '@message/encode/device-sent'
import { unpadPkcs7 } from '@message/encode/padding'
import { processIncomingNewsletterMessage } from '@message/kinds/newsletter'
import { proto } from '@proto'
import { WA_MESSAGE_TAGS, WA_MESSAGE_TYPES } from '@protocol/constants'
import {
    isBroadcastJid,
    isGroupJid,
    isNewsletterJid,
    parseJidFull,
    parseSignalAddressFromJid,
    toUserJid
} from '@protocol/jid'
import type { WaRetryDecryptFailureContext } from '@retry/types'
import type { SenderKeyManager } from '@signal/group/SenderKeyManager'
import type { SignalProtocol } from '@signal/session/SignalProtocol'
import type { SignalAddress } from '@signal/types'
import { buildAckNode, buildReceiptNode } from '@transport/node/builders/global'
import { decodeNodeContentBase64OrBytes, findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { longToNumber, parseOptionalInt, toError } from '@util/primitives'

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
    readonly emitNewsletterMessageUpdate?: (event: WaIncomingNewsletterMessageUpdateEvent) => void
    readonly emitUnhandledStanza?: (event: WaIncomingUnhandledStanzaEvent) => void
}

interface MessageIdentityAttrs {
    readonly remoteJidAlt?: string
    readonly participantAlt?: string
    readonly senderUsername?: string
    readonly recipientJid?: string
    readonly recipientAlt?: string
    readonly pushName: string | undefined
}

// Addressing fields use conditional includes so they're absent (not own-undefined) when
// the source attr isn't present — the `...keyIdentity` spread then only injects defined
// keys into the event's `key`. `pushName` is destructured straight to the event top-level
// and stays present-as-undefined there.
function extractMessageIdentityAttrs(attrs: BinaryNode['attrs']): MessageIdentityAttrs {
    const rawRemoteJidAlt = attrs.sender_pn ?? attrs.sender_lid
    const rawParticipantAlt = attrs.participant_pn ?? attrs.participant_lid
    const rawRecipientAlt = attrs.peer_recipient_pn ?? attrs.peer_recipient_lid
    const rawRecipient = attrs.recipient
    const senderUsername = attrs.participant_username ?? attrs.username
    return {
        ...(rawRemoteJidAlt ? { remoteJidAlt: toUserJid(rawRemoteJidAlt) } : {}),
        ...(rawParticipantAlt ? { participantAlt: toUserJid(rawParticipantAlt) } : {}),
        ...(senderUsername !== undefined ? { senderUsername } : {}),
        ...(rawRecipient ? { recipientJid: toUserJid(rawRecipient) } : {}),
        ...(rawRecipientAlt ? { recipientAlt: toUserJid(rawRecipientAlt) } : {}),
        pushName: attrs.notify
    }
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

export function buildRecoveredIncomingEvent(
    webMessageInfo: proto.IWebMessageInfo
): WaIncomingMessageEvent {
    const key = webMessageInfo.key ?? {}
    const chatJid = key.remoteJid ?? undefined
    const fromMe = key.fromMe === true
    const participant = key.participant ?? undefined
    const isGroup = chatJid ? isGroupJid(chatJid) : false
    const isBroadcast = chatJid ? isBroadcastJid(chatJid) : false
    const rawSender = fromMe ? undefined : isGroup || isBroadcast ? participant : chatJid
    const sender = rawSender ? parseJidFull(rawSender) : null
    const senderDevice = sender?.address.device
    const timestampSeconds =
        webMessageInfo.messageTimestamp !== null && webMessageInfo.messageTimestamp !== undefined
            ? longToNumber(webMessageInfo.messageTimestamp)
            : undefined
    const stanzaId = key.id ?? undefined
    const message = webMessageInfo.message ?? undefined
    const expirationSeconds = pickIncomingExpirationSeconds(message)
    const rawNode: BinaryNode = {
        tag: WA_MESSAGE_TAGS.MESSAGE,
        attrs: {
            ...(stanzaId !== undefined ? { id: stanzaId } : {}),
            ...(chatJid !== undefined ? { from: chatJid } : {}),
            ...(participant !== undefined ? { participant } : {})
        }
    }
    return {
        rawNode,
        key: {
            remoteJid: chatJid ?? '',
            id: stanzaId ?? '',
            fromMe,
            isGroup,
            isBroadcast,
            isNewsletter: false,
            ...(participant !== undefined ? { participant } : {}),
            senderDevice: senderDevice ?? 0
        },
        timestampSeconds,
        ...(expirationSeconds !== undefined ? { expirationSeconds } : {}),
        message
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
        options.logger.trace('sent retry receipt for undecryptable incoming message', {
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

function processMsmsgEncNode(
    node: BinaryNode,
    encNode: BinaryNode,
    senderJid: string | undefined,
    options: WaIncomingMessageAckHandlerOptions
): DecryptEncNodeResult {
    try {
        const payload = decodeNodeContentBase64OrBytes(encNode.content, 'message.enc')
        const decoded = proto.MessageSecretMessage.decode(payload)
        if (!decoded.encIv || !decoded.encPayload) {
            options.logger.warn('msmsg payload missing encIv/encPayload', {
                id: node.attrs.id,
                from: node.attrs.from
            })
            options.emitUnhandledStanza?.({
                rawNode: buildIncomingEventRawNode(node),
                stanzaId: node.attrs.id,
                chatJid: node.attrs.from,
                stanzaType: node.attrs.type,
                offline: node.attrs.offline !== undefined,
                reason: 'message.msmsg.missing_payload'
            })
            return { success: false, encType: 'msmsg' }
        }
        const message: proto.IMessage = {
            secretEncryptedMessage: {
                encIv: decoded.encIv,
                encPayload: decoded.encPayload
            }
        }
        const chatJid = node.attrs.from ? toUserJid(node.attrs.from) : node.attrs.from
        const sender = senderJid ? parseJidFull(senderJid) : null
        const isGroup = chatJid ? isGroupJid(chatJid) : false
        const isBroadcast = chatJid ? isBroadcastJid(chatJid) : false
        const { pushName, ...keyIdentity } = extractMessageIdentityAttrs(node.attrs)
        options.emitIncomingMessage?.({
            rawNode: buildIncomingEventRawNode(node),
            key: {
                remoteJid: chatJid ?? '',
                id: node.attrs.id ?? '',
                fromMe: false,
                isGroup,
                isBroadcast,
                isNewsletter: false,
                ...keyIdentity,
                ...((isGroup || isBroadcast) && sender?.userJid
                    ? { participant: sender.userJid }
                    : {}),
                senderDevice: sender?.address.device ?? 0
            },
            stanzaType: node.attrs.type,
            offline: node.attrs.offline !== undefined,
            timestampSeconds: parseOptionalInt(node.attrs.t),
            pushName,
            message
        })
        return { success: true, encType: 'msmsg' }
    } catch (error) {
        options.logger.warn('failed to decode msmsg payload', {
            id: node.attrs.id,
            from: node.attrs.from,
            message: toError(error).message
        })
        options.emitUnhandledStanza?.({
            rawNode: buildIncomingEventRawNode(node),
            stanzaId: node.attrs.id,
            chatJid: node.attrs.from,
            stanzaType: node.attrs.type,
            offline: node.attrs.offline !== undefined,
            reason: 'message.msmsg.decode_failed'
        })
        return { success: false, encType: 'msmsg', error }
    }
}

async function decryptAndProcessEncNode(
    node: BinaryNode,
    encNode: BinaryNode,
    encType: string,
    senderJid: string,
    options: WaIncomingMessageAckHandlerOptions,
    decrypt: (ciphertext: Uint8Array, senderAddress: SignalAddress) => Promise<Uint8Array>
): Promise<DecryptEncNodeResult> {
    const log = options.logger.child({
        id: node.attrs.id,
        from: node.attrs.from,
        participant: node.attrs.participant
    })
    try {
        const senderAddress = parseSignalAddressFromJid(senderJid)
        const decryptedPayload = await decrypt(
            decodeNodeContentBase64OrBytes(encNode.content, 'message.enc'),
            senderAddress
        )
        const unpaddedPlaintext = unpadPkcs7(decryptedPayload)
        const decodedMessage = proto.Message.decode(unpaddedPlaintext)
        const message = unwrapDeviceSentMessage(decodedMessage) ?? decodedMessage
        const senderKeyDistribution = pickSenderKeyDistributionPayload(message)
        if (senderKeyDistribution && options.senderKeyManager) {
            try {
                await options.senderKeyManager.processSenderKeyDistributionPayload(
                    senderKeyDistribution.groupId,
                    senderAddress,
                    senderKeyDistribution.payload
                )
                log.trace('processed incoming sender key distribution', {
                    groupId: senderKeyDistribution.groupId
                })
            } catch (error) {
                log.warn('failed to process incoming sender key distribution', {
                    groupId: senderKeyDistribution.groupId,
                    message: toError(error).message
                })
            }
        }
        if (shouldEmitIncomingMessage(message)) {
            // remoteJid is the chat identity, which is deviceless: the device
            // lives in senderDevice (from senderAddress), so strip any `:device`
            // segment the `from` attr carries for 1:1 chats.
            const fromAttr = node.attrs.from
            const chatJid = fromAttr ? toUserJid(fromAttr) : fromAttr
            const isGroup = chatJid ? isGroupJid(chatJid) : false
            const isBroadcast = chatJid ? isBroadcastJid(chatJid) : false
            const senderUserJid = `${senderAddress.user}@${senderAddress.server}`
            const { pushName, ...keyIdentity } = extractMessageIdentityAttrs(node.attrs)
            const expirationSeconds = pickIncomingExpirationSeconds(message)
            options.emitIncomingMessage?.({
                rawNode: buildIncomingEventRawNode(node),
                key: {
                    remoteJid: chatJid ?? '',
                    id: node.attrs.id ?? '',
                    fromMe: false,
                    isGroup,
                    isBroadcast,
                    isNewsletter: false,
                    ...keyIdentity,
                    senderDevice: senderAddress.device,
                    ...(isGroup || isBroadcast ? { participant: senderUserJid } : {})
                },
                stanzaType: node.attrs.type,
                offline: node.attrs.offline !== undefined,
                timestampSeconds: parseOptionalInt(node.attrs.t),
                ...(expirationSeconds !== undefined ? { expirationSeconds } : {}),
                pushName,
                message
            })
        }
        return { success: true, encType }
    } catch (error) {
        log.warn('failed to decrypt incoming message', {
            encType,
            message: toError(error).message
        })
        options.emitUnhandledStanza?.({
            rawNode: buildIncomingEventRawNode(node),
            stanzaId: node.attrs.id,
            chatJid: node.attrs.from,
            stanzaType: node.attrs.type,
            offline: node.attrs.offline !== undefined,
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

    const from = node.attrs.from
    if (from && isNewsletterJid(from)) {
        return handleIncomingNewsletterMessage(node, options)
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
                            rawNode: buildIncomingEventRawNode(node),
                            stanzaId: node.attrs.id,
                            chatJid: node.attrs.from,
                            stanzaType: node.attrs.type,
                            offline: node.attrs.offline !== undefined,
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
                case 'msmsg': {
                    // Bot streaming chunk: payload is a MessageSecretMessage proto
                    // (encIv + encPayload), not a Signal envelope. The actual
                    // decryption uses the parent prompt's messageSecret and is
                    // performed downstream by `tryDecryptBotChunk`.
                    result = processMsmsgEncNode(node, child, senderJid, options)
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
            await sendRetryReceiptForDecryptFailure(
                node,
                options,
                firstDecryptFailure.error,
                firstDecryptFailure.encType
            )
            shouldSendStandardReceipt = false
        }
    }

    const id = node.attrs.id
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
        options.logger.trace('sending inbound message ack', {
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
    options.logger.trace('sending inbound message receipt', {
        id,
        to: from,
        type: receiptNode.attrs.type,
        participant: receiptNode.attrs.participant
    })
    await options.sendNode(receiptNode)
    return true
}

async function handleIncomingNewsletterMessage(
    node: BinaryNode,
    options: WaIncomingMessageAckHandlerOptions
): Promise<boolean> {
    processIncomingNewsletterMessage(node, {
        logger: options.logger,
        emitIncomingMessage: options.emitIncomingMessage,
        emitNewsletterMessageUpdate: options.emitNewsletterMessageUpdate,
        emitUnhandledStanza: options.emitUnhandledStanza
    })

    const id = node.attrs.id
    const from = node.attrs.from
    if (!id || !from) {
        options.logger.warn('incoming newsletter message missing required attrs for ack', {
            hasId: Boolean(id),
            hasFrom: Boolean(from),
            type: node.attrs.type
        })
        return true
    }

    const ackNode = buildAckNode({
        kind: 'message',
        node,
        id,
        to: from
    })
    options.logger.trace('sending inbound newsletter message ack', {
        id,
        to: from,
        type: ackNode.attrs.type
    })
    await options.sendNode(ackNode)
    return true
}
