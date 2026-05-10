import { WA_NODE_TAGS } from '@protocol/nodes'
import { WA_CHATSTATE_MEDIA } from '@protocol/presence'
import type { ChatstateMedia, ChatstateState } from '@transport/node/builders/chatstate'
import { getFirstNodeChild } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'

interface ParsedChatstate {
    readonly state: ChatstateState
    readonly media?: ChatstateMedia
    readonly participantJid?: string
}

export function parseChatstateNode(node: BinaryNode): ParsedChatstate | null {
    const child = getFirstNodeChild(node)
    if (!child) {
        return null
    }
    if (child.tag !== WA_NODE_TAGS.COMPOSING && child.tag !== WA_NODE_TAGS.PAUSED) {
        return null
    }
    const result: {
        state: ChatstateState
        media?: ChatstateMedia
        participantJid?: string
    } = { state: child.tag }
    if (child.tag === WA_NODE_TAGS.COMPOSING && child.attrs.media === WA_CHATSTATE_MEDIA.AUDIO) {
        result.media = WA_CHATSTATE_MEDIA.AUDIO
    }
    if (node.attrs.participant !== undefined) {
        result.participantJid = node.attrs.participant
    }
    return result
}
