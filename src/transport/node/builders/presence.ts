import { isBroadcastJid, isNewsletterJid, splitJid } from '@protocol/jid'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { WA_PRESENCE_TYPES } from '@protocol/presence'
import type { BinaryNode } from '@transport/types'

export interface BuildPresenceNodeInput {
    readonly type?: typeof WA_PRESENCE_TYPES.AVAILABLE | typeof WA_PRESENCE_TYPES.UNAVAILABLE
    readonly name?: string
}

export function buildPresenceNode(input?: BuildPresenceNodeInput): BinaryNode {
    const attrs: Record<string, string> = {}
    if (input?.type) {
        attrs.type = input.type
    }
    if (input?.name) {
        attrs.name = input.name
    }
    return {
        tag: WA_NODE_TAGS.PRESENCE,
        attrs
    }
}

export interface BuildPresenceSubscribeNodeInput {
    readonly jid: string
    readonly name?: string
    readonly context?: string
    /**
     * Receiver-mode `<tctoken>` node echoed back to prove this account is a
     * trusted contact, gating the target's presence/last-seen visibility.
     * Attached as a child of the `<presence>` stanza when present.
     */
    readonly privacyTokenNode?: BinaryNode
}

function assertSubscribeJid(jid: string): void {
    if (isNewsletterJid(jid) || isBroadcastJid(jid)) {
        throw new Error(`presence subscribe is not supported for jid: ${jid}`)
    }
    splitJid(jid)
}

export function buildPresenceSubscribeNode(input: BuildPresenceSubscribeNodeInput): BinaryNode {
    assertSubscribeJid(input.jid)
    const attrs: Record<string, string> = {
        type: WA_PRESENCE_TYPES.SUBSCRIBE,
        to: input.jid
    }
    if (input.name !== undefined) {
        attrs.name = input.name
    }
    if (input.context !== undefined) {
        attrs.context = input.context
    }
    return {
        tag: WA_NODE_TAGS.PRESENCE,
        attrs,
        ...(input.privacyTokenNode ? { content: [input.privacyTokenNode] } : {})
    }
}
