import type {
    WaIncomingMessageEvent,
    WaIncomingMessageKey,
    WaIncomingNewsletterMessageUpdateEvent,
    WaIncomingUnavailableMessageEvent,
    WaIncomingUnhandledStanzaEvent,
    WaUnavailableMessageKind
} from '@client/types'
import type { Logger } from '@infra/log/types'
import { pickIncomingExpirationSeconds } from '@message/context-info'
import { unwrapDeviceSentMessage } from '@message/encode/device-sent'
import { unpadPkcs7 } from '@message/encode/padding'
import { processIncomingNewsletterMessage } from '@message/kinds/newsletter'
import { proto } from '@proto'
import { WA_MESSAGE_TAGS, WA_MESSAGE_TYPES } from '@protocol/constants'
import {
    canonicalizeOwnAccountJid,
    isBroadcastJid,
    isGroupJid,
    isNewsletterJid,
    isOwnAccountJid,
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
    readonly getMeLid?: () => string | null | undefined
    readonly signalProtocol?: SignalProtocol
    readonly senderKeyManager?: SenderKeyManager
    readonly onDecryptFailure?: (
        context: WaRetryDecryptFailureContext,
        error: unknown
    ) => Promise<boolean>
    readonly emitIncomingMessage?: (event: WaIncomingMessageEvent) => void
    readonly emitNewsletterMessageUpdate?: (event: WaIncomingNewsletterMessageUpdateEvent) => void
    readonly emitUnavailableMessage?: (event: WaIncomingUnavailableMessageEvent) => void
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

type MessageKeyIdentity = Omit<MessageIdentityAttrs, 'pushName'>

/**
 * Self-authored 1:1 chat is the recipient, so its alternate addressing is the
 * `recipient*` attrs (the `sender*` attrs describe me). Promotes `recipientAlt`
 * to `remoteJidAlt` and drops the stale sender/recipient fields.
 */
function promoteRecipientAddressing(identity: MessageKeyIdentity): MessageKeyIdentity {
    return {
        ...(identity.recipientAlt ? { remoteJidAlt: identity.recipientAlt } : {}),
        ...(identity.senderUsername !== undefined
            ? { senderUsername: identity.senderUsername }
            : {})
    }
}

/**
 * Resolves the {@link WaIncomingMessageKey} for a decrypted stanza. `remoteJid`
 * is the chat: the `from`, or the recipient (`recipient` attr, then the
 * deviceSentMessage `destinationJid`) when the message is `fromMe`.
 */
function buildIncomingMessageKey(
    node: BinaryNode,
    sender: { readonly userJid: string; readonly device: number } | null,
    options: WaIncomingMessageAckHandlerOptions,
    destinationJid?: string
): { readonly key: WaIncomingMessageKey; readonly pushName: string | undefined } {
    const fromUserJid = node.attrs.from ? toUserJid(node.attrs.from) : node.attrs.from
    const isGroup = fromUserJid ? isGroupJid(fromUserJid) : false
    const isBroadcast = fromUserJid ? isBroadcastJid(fromUserJid) : false
    const fromMe = sender
        ? isOwnAccountJid(sender.userJid, options.getMeJid?.(), options.getMeLid?.())
        : false
    const selfSentChat =
        fromMe && !isGroup && !isBroadcast
            ? (node.attrs.recipient ?? destinationJid ?? undefined)
            : undefined
    const chatJid = selfSentChat ? toUserJid(selfSentChat) : fromUserJid
    const { pushName, ...identity } = extractMessageIdentityAttrs(node.attrs)
    const keyIdentity = selfSentChat ? promoteRecipientAddressing(identity) : identity
    return {
        pushName,
        key: {
            remoteJid: chatJid ?? '',
            id: node.attrs.id ?? '',
            fromMe,
            isGroup,
            isBroadcast,
            isNewsletter: false,
            ...keyIdentity,
            senderDevice: sender?.device ?? 0,
            ...((isGroup || isBroadcast) && sender ? { participant: sender.userJid } : {})
        }
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

/**
 * Rebuilds a `message` event from a recovered {@link proto.IWebMessageInfo}
 * (placeholder resend). `meJid` is the current account user JID, used as the
 * author fallback for self-sent group messages when the proto carries no
 * participant and no `originalSelfAuthorUserJidString`.
 */
export function buildRecoveredIncomingEvent(
    webMessageInfo: proto.IWebMessageInfo,
    meJid?: string | null
): WaIncomingMessageEvent {
    const key = webMessageInfo.key ?? {}
    const chatJid = key.remoteJid ?? undefined
    const fromMe = key.fromMe === true
    const isGroup = chatJid ? isGroupJid(chatJid) : false
    const isBroadcast = chatJid ? isBroadcastJid(chatJid) : false
    const rawSelfAuthor = webMessageInfo.originalSelfAuthorUserJidString ?? meJid ?? undefined
    const selfAuthor =
        fromMe && (isGroup || isBroadcast) && rawSelfAuthor ? toUserJid(rawSelfAuthor) : undefined
    const participant = webMessageInfo.participant ?? key.participant ?? selfAuthor
    const pushName = webMessageInfo.pushName ?? undefined
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
            ...(participant !== undefined ? { participant } : {}),
            ...(pushName !== undefined ? { notify: pushName } : {})
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
        ...(pushName !== undefined ? { pushName } : {}),
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
        const sender = senderJid ? parseJidFull(senderJid) : null
        const { key, pushName } = buildIncomingMessageKey(
            node,
            sender ? { userJid: sender.userJid, device: sender.address.device } : null,
            options
        )
        options.emitIncomingMessage?.({
            rawNode: buildIncomingEventRawNode(node),
            key,
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
            const { key, pushName } = buildIncomingMessageKey(
                node,
                {
                    userJid: `${senderAddress.user}@${senderAddress.server}`,
                    device: senderAddress.device
                },
                options,
                decodedMessage.deviceSentMessage?.destinationJid ?? undefined
            )
            const expirationSeconds = pickIncomingExpirationSeconds(message)
            options.emitIncomingMessage?.({
                rawNode: buildIncomingEventRawNode(node),
                key,
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
                        (ciphertext, senderAddress) => {
                            const sessionJid = canonicalizeOwnAccountJid(
                                senderJid,
                                options.getMeJid?.(),
                                options.getMeLid?.()
                            )
                            return options.signalProtocol!.decryptMessage(
                                sessionJid === senderJid
                                    ? senderAddress
                                    : parseSignalAddressFromJid(sessionJid),
                                {
                                    type: encType,
                                    ciphertext
                                }
                            )
                        }
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

    const unavailableNode = findNodeChild(node, 'unavailable')
    if (unavailableNode) {
        const kind: WaUnavailableMessageKind =
            unavailableNode.attrs.hosted === 'true'
                ? 'hosted'
                : unavailableNode.attrs.type === 'view_once'
                  ? 'view_once'
                  : 'other'
        const senderJid = node.attrs.participant ?? node.attrs.from
        const sender = senderJid ? parseJidFull(senderJid) : null
        const { key, pushName } = buildIncomingMessageKey(
            node,
            sender ? { userJid: sender.userJid, device: sender.address.device } : null,
            options
        )
        options.emitUnavailableMessage?.({
            rawNode: buildIncomingEventRawNode(node),
            key,
            kind,
            stanzaType: node.attrs.type,
            offline: node.attrs.offline !== undefined,
            timestampSeconds: parseOptionalInt(node.attrs.t),
            pushName
        })
        const ackNode = buildAckNode({
            kind: 'message',
            node,
            id,
            to: from,
            from: options.getMeJid?.()
        })
        options.logger.trace('acking unavailable incoming message', {
            id,
            to: from,
            type: ackNode.attrs.type,
            participant: ackNode.attrs.participant,
            unavailableKind: kind
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
