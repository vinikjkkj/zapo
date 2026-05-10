import { isBroadcastJid, isNewsletterJid, splitJid } from '@protocol/jid'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { type WaChatstateMedia } from '@protocol/presence'
import type { BinaryNode } from '@transport/types'

export type ChatstateState = typeof WA_NODE_TAGS.COMPOSING | typeof WA_NODE_TAGS.PAUSED
export type ChatstateMedia = WaChatstateMedia

export interface BuildChatstateNodeInput {
    readonly jid: string
    readonly state: ChatstateState
    readonly media?: ChatstateMedia
}

function assertChatstateJid(jid: string): void {
    if (isNewsletterJid(jid) || isBroadcastJid(jid)) {
        throw new Error(`chatstate is not supported for jid: ${jid}`)
    }
    splitJid(jid)
}

export function buildChatstateNode(input: BuildChatstateNodeInput): BinaryNode {
    assertChatstateJid(input.jid)
    if (input.state !== WA_NODE_TAGS.COMPOSING && input.media !== undefined) {
        throw new Error('chatstate media is only valid with composing state')
    }
    const childAttrs: Record<string, string> = {}
    if (input.media !== undefined) {
        childAttrs.media = input.media
    }
    return {
        tag: WA_NODE_TAGS.CHATSTATE,
        attrs: { to: input.jid },
        content: [
            {
                tag: input.state,
                attrs: childAttrs
            }
        ]
    }
}
