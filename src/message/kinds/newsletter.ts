import type {
    WaIncomingMessageEvent,
    WaIncomingNewsletterMessageUpdateEvent,
    WaIncomingUnhandledStanzaEvent,
    WaNewsletterMessageUpdate,
    WaNewsletterPollVoteEntry,
    WaNewsletterReactionEntry
} from '@client/types'
import type { Logger } from '@infra/log/types'
import { pickIncomingExpirationSeconds } from '@message/context-info'
import { proto } from '@proto'
import { WA_NODE_TAGS } from '@protocol/constants'
import { WA_EDIT_ATTRS } from '@protocol/message'
import { decodeNodeContentBase64OrBytes, findNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt, toError } from '@util/primitives'

interface ProcessNewsletterMessageOptions {
    readonly logger: Logger
    readonly emitIncomingMessage?: (event: WaIncomingMessageEvent) => void
    readonly emitNewsletterMessageUpdate?: (event: WaIncomingNewsletterMessageUpdateEvent) => void
    readonly emitUnhandledStanza?: (event: WaIncomingUnhandledStanzaEvent) => void
}

export function processNewsletterLiveUpdates(
    notification: BinaryNode,
    options: ProcessNewsletterMessageOptions
): void {
    const liveUpdates = findNodeChild(notification, 'live_updates')
    if (!liveUpdates) return
    const messagesNode = findNodeChild(liveUpdates, 'messages')
    if (!messagesNode || !Array.isArray(messagesNode.content)) return
    const from = notification.attrs.from
    const outerId = notification.attrs.id
    const messagesT = messagesNode.attrs.t ?? notification.attrs.t
    for (const inner of messagesNode.content) {
        if (inner.tag !== 'message') continue
        if (!Array.isArray(inner.content) || inner.content.length === 0) {
            continue
        }
        const synth: BinaryNode = {
            tag: 'message',
            attrs: {
                ...(from ? { from } : {}),
                ...(outerId ? { id: outerId } : {}),
                ...(messagesT ? { t: messagesT } : {}),
                ...inner.attrs
            },
            content: inner.content
        }
        processIncomingNewsletterMessage(synth, options)
    }
}

export function processIncomingNewsletterMessage(
    node: BinaryNode,
    options: ProcessNewsletterMessageOptions
): void {
    const messageType = node.attrs.type
    const editAttr = node.attrs.edit
    let emittedAggregate = false

    const reactionsEnvelope = findNodeChild(node, 'reactions')
    if (reactionsEnvelope) {
        const reactions = parseReactionAggregate(reactionsEnvelope)
        if (reactions === null) {
            emitUnhandled(node, options, 'newsletter.invalid_reactions')
            return
        }
        emitUpdate(node, options, {
            kind: 'reaction',
            isSender: node.attrs.is_sender === 'true',
            revoked: false,
            reactions
        })
        emittedAggregate = true
    } else {
        const reactionNode = findNodeChild(node, 'reaction')
        if (reactionNode) {
            const revoked =
                editAttr === WA_EDIT_ATTRS.SENDER_REVOKE || messageType === 'reaction_revoke'
            emitUpdate(node, options, {
                kind: 'reaction',
                isSender: node.attrs.is_sender === 'true',
                revoked,
                reactions: [reactionNode.attrs.code ? { code: reactionNode.attrs.code } : {}]
            })
            emittedAggregate = true
        }
    }

    const votesNode = findNodeChild(node, 'votes')
    if (votesNode) {
        const votes = parsePollVotes(votesNode)
        if (votes === null) {
            emitUnhandled(node, options, 'newsletter.invalid_votes')
            return
        }
        emitUpdate(node, options, {
            kind: 'poll_vote',
            isSender: node.attrs.is_sender === 'true',
            votes
        })
        emittedAggregate = true
    }

    const counters = parseCounters(node)
    if (counters) {
        emitUpdate(node, options, counters)
        emittedAggregate = true
    }

    if (emittedAggregate) return

    if (editAttr === WA_EDIT_ATTRS.ADMIN_REVOKE) {
        emitUpdate(node, options, { kind: 'revoke' })
        return
    }

    if (editAttr === WA_EDIT_ATTRS.NEWSLETTER_EDIT) {
        const decoded = decodePlaintext(node, options)
        if (decoded === null) {
            return
        }
        emitUpdate(node, options, {
            kind: 'edit',
            plaintext: decoded.plaintext,
            message: decoded.message
        })
        return
    }

    const decoded = decodePlaintext(node, options)
    if (decoded === null) {
        return
    }

    const chatJid = node.attrs.from
    const serverId = parseOptionalInt(node.attrs.server_id)
    const expirationSeconds = pickIncomingExpirationSeconds(decoded.message)
    options.emitIncomingMessage?.({
        rawNode: node,
        key: {
            remoteJid: chatJid ?? '',
            id: node.attrs.id ?? '',
            fromMe: node.attrs.is_sender === 'true',
            isGroup: false,
            isBroadcast: false,
            isNewsletter: true,
            senderDevice: 0,
            ...(serverId !== undefined ? { serverId } : {})
        },
        stanzaType: messageType,
        offline: node.attrs.offline !== undefined,
        timestampSeconds: parseOptionalInt(node.attrs.t),
        ...(expirationSeconds !== undefined ? { expirationSeconds } : {}),
        encryptionType: 'plaintext',
        plaintext: decoded.plaintext,
        message: decoded.message
    })
}

function emitUpdate(
    node: BinaryNode,
    options: ProcessNewsletterMessageOptions,
    update: WaNewsletterMessageUpdate
): void {
    options.emitNewsletterMessageUpdate?.({
        rawNode: node,
        stanzaId: node.attrs.id,
        chatJid: node.attrs.from,
        stanzaType: node.attrs.type,
        offline: node.attrs.offline !== undefined,
        timestampSeconds: parseOptionalInt(node.attrs.t),
        parentMessageServerId: parseOptionalInt(node.attrs.server_id),
        update
    })
}

function emitUnhandled(
    node: BinaryNode,
    options: ProcessNewsletterMessageOptions,
    reason: string
): void {
    options.emitUnhandledStanza?.({
        rawNode: node,
        stanzaId: node.attrs.id,
        chatJid: node.attrs.from,
        stanzaType: node.attrs.type,
        offline: node.attrs.offline !== undefined,
        reason
    })
}

function decodePlaintext(
    node: BinaryNode,
    options: ProcessNewsletterMessageOptions
): { readonly plaintext: Uint8Array; readonly message: proto.IMessage } | null {
    const plaintextNode = findNodeChild(node, WA_NODE_TAGS.PLAINTEXT)
    if (!plaintextNode) {
        emitUnhandled(node, options, 'newsletter.missing_plaintext')
        return null
    }
    try {
        const plaintext = decodeNodeContentBase64OrBytes(
            plaintextNode.content,
            'newsletter.plaintext'
        )
        const message = proto.Message.decode(plaintext)
        return { plaintext, message }
    } catch (error) {
        options.logger.warn('failed to decode newsletter plaintext message', {
            id: node.attrs.id,
            from: node.attrs.from,
            type: node.attrs.type,
            message: toError(error).message
        })
        emitUnhandled(node, options, 'newsletter.decode_failed')
        return null
    }
}

function parsePollVotes(votesNode: BinaryNode): WaNewsletterPollVoteEntry[] | null {
    if (!Array.isArray(votesNode.content)) {
        return null
    }
    const entries: WaNewsletterPollVoteEntry[] = []
    let withCount = 0
    let withoutCount = 0
    for (const child of votesNode.content) {
        if (child.tag !== 'vote') continue
        if (!(child.content instanceof Uint8Array) || child.content.byteLength !== 32) {
            return null
        }
        if (child.attrs.count === undefined) {
            entries.push({ optionHash: child.content })
            withoutCount += 1
            continue
        }
        const count = parseOptionalInt(child.attrs.count)
        if (count === undefined || count < 1) {
            return null
        }
        entries.push({ optionHash: child.content, count })
        withCount += 1
    }
    if (withCount > 0 && withoutCount > 0) {
        return null
    }
    if (entries.length === 0) {
        return null
    }
    return entries
}

function parseCounters(
    node: BinaryNode
): (WaNewsletterMessageUpdate & { kind: 'counters' }) | null {
    const views = parseCounterAttr(findNodeChild(node, 'views_count'))
    const forwards = parseCounterAttr(findNodeChild(node, 'forwards_count'))
    const responses = parseCounterAttr(findNodeChild(node, 'responses_count'))
    if (views === undefined && forwards === undefined && responses === undefined) return null
    return {
        kind: 'counters',
        ...(views !== undefined ? { views } : {}),
        ...(forwards !== undefined ? { forwards } : {}),
        ...(responses !== undefined ? { responses } : {})
    }
}

function parseCounterAttr(node: BinaryNode | undefined): number | undefined {
    if (!node) return undefined
    return parseOptionalInt(node.attrs.count)
}

function parseReactionAggregate(envelope: BinaryNode): WaNewsletterReactionEntry[] | null {
    if (!Array.isArray(envelope.content)) return null
    const out: WaNewsletterReactionEntry[] = []
    for (const child of envelope.content) {
        if (child.tag !== 'reaction') continue
        const code = child.attrs.code
        if (typeof code !== 'string' || code.length === 0) return null
        const count = parseOptionalInt(child.attrs.count)
        if (count === undefined || count < 1) return null
        out.push({ code, count })
    }
    if (out.length === 0) return null
    return out
}
