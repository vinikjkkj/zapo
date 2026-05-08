import type {
    WaIncomingMessageEvent,
    WaIncomingNewsletterReactionEvent,
    WaIncomingUnhandledStanzaEvent
} from '@client/types'
import type { Logger } from '@infra/log/types'
import { proto } from '@proto'
import { WA_NODE_TAGS } from '@protocol/constants'
import { decodeNodeContentBase64OrBytes, findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt, toError } from '@util/primitives'

interface ProcessNewsletterMessageOptions {
    readonly logger: Logger
    readonly emitIncomingMessage?: (event: WaIncomingMessageEvent) => void
    readonly emitNewsletterReaction?: (event: WaIncomingNewsletterReactionEvent) => void
    readonly emitUnhandledStanza?: (event: WaIncomingUnhandledStanzaEvent) => void
}

export function processIncomingNewsletterMessage(
    node: BinaryNode,
    options: ProcessNewsletterMessageOptions
): void {
    const chatJid = node.attrs.from
    const messageType = node.attrs.type

    if (messageType === 'reaction') {
        emitReactionEvent(node, options, false)
        return
    }
    if (messageType === 'reaction_revoke') {
        emitReactionEvent(node, options, true)
        return
    }

    const plaintextNode = findNodeChild(node, WA_NODE_TAGS.PLAINTEXT)
    if (!plaintextNode) {
        options.emitUnhandledStanza?.({
            rawNode: node,
            stanzaId: node.attrs.id,
            chatJid,
            stanzaType: messageType,
            reason: 'newsletter.missing_plaintext'
        })
        return
    }

    let plaintext: Uint8Array
    let message: proto.IMessage
    try {
        plaintext = decodeNodeContentBase64OrBytes(plaintextNode.content, 'newsletter.plaintext')
        message = proto.Message.decode(plaintext)
    } catch (error) {
        options.logger.warn('failed to decode newsletter plaintext message', {
            id: node.attrs.id,
            from: chatJid,
            type: messageType,
            message: toError(error).message
        })
        options.emitUnhandledStanza?.({
            rawNode: node,
            stanzaId: node.attrs.id,
            chatJid,
            stanzaType: messageType,
            reason: 'newsletter.decode_failed'
        })
        return
    }

    options.emitIncomingMessage?.({
        rawNode: node,
        stanzaId: node.attrs.id,
        chatJid,
        stanzaType: messageType,
        timestampSeconds: parseOptionalInt(node.attrs.t),
        senderJid: chatJid,
        encryptionType: 'plaintext',
        isGroupChat: false,
        isBroadcastChat: false,
        isNewsletterChat: true,
        serverId: parseOptionalInt(node.attrs.server_id),
        isSender: node.attrs.is_sender === 'true',
        plaintext,
        message
    })
}

function emitReactionEvent(
    node: BinaryNode,
    options: ProcessNewsletterMessageOptions,
    revoked: boolean
): void {
    const chatJid = node.attrs.from
    const reactionNode = findNodeChild(node, 'reaction')
    if (!reactionNode) {
        options.emitUnhandledStanza?.({
            rawNode: node,
            stanzaId: node.attrs.id,
            chatJid,
            stanzaType: node.attrs.type,
            reason: 'newsletter.missing_reaction'
        })
        return
    }
    options.emitNewsletterReaction?.({
        rawNode: node,
        stanzaId: node.attrs.id,
        chatJid,
        stanzaType: node.attrs.type,
        timestampSeconds: parseOptionalInt(node.attrs.t),
        parentMessageServerId: parseOptionalInt(node.attrs.server_id),
        reactionCode: reactionNode.attrs.code,
        revoked
    })
}
