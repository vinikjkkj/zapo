import { type BinaryNode, getFirstNodeChild } from 'zapo-js/transport'
import { bytesToHex } from 'zapo-js/util'

import { randomBytes } from '@zapo-js/voip-media'

import type { NodeInfo } from '../types.js'

/** 16 random bytes as 32 uppercase hex characters. */
export function generateCallStanzaId(): string {
    return bytesToHex(randomBytes(16)).toUpperCase()
}

/** A new call id, in the stanza id format. */
export function generateCallId(): string {
    return generateCallStanzaId()
}

/** A `<call>` to `to` whose one child names the call: `call-id`, `call-creator`, then `attrs` in order. */
export function callStanza(
    to: string,
    tag: string,
    callId: string,
    callCreator: string,
    attrs?: Readonly<Record<string, string>>,
    content?: BinaryNode[]
): BinaryNode {
    const childAttrs = { 'call-id': callId, 'call-creator': callCreator, ...attrs }
    return {
        tag: 'call',
        attrs: { to, id: generateCallStanzaId() },
        content: [content ? { tag, attrs: childAttrs, content } : { tag, attrs: childAttrs }]
    }
}

/** Where a call answer goes: `<call-id>@call` on a group call, the peer device verbatim on 1:1. */
export function callTarget(peerJid: string, callId: string, isGroupCall: boolean): string {
    return isGroupCall ? toCallServerJid(callId) : peerJid
}

export function extractNodeInfo(node: BinaryNode): NodeInfo | null {
    const innerNode = getFirstNodeChild(node)
    if (!innerNode) {
        return null
    }

    return {
        tag: innerNode.tag,
        peerJid: node.attrs.from,
        callId: innerNode.attrs?.['call-id'] || '',
        innerNode
    }
}

/** The server a group call's stanzas are addressed at, as `<call-id>@call`. */
const WA_CALL_SERVER = 'call'

/** The address of a call itself: where a group offer and a group accept go. */
export function toCallServerJid(callId: string): string {
    return `${callId}@${WA_CALL_SERVER}`
}

const CALL_SERVER_SUFFIX = `@${WA_CALL_SERVER}`

/** The call id a `<call-id>@call` address names, or `null` for any other jid. */
export function callIdOfCallServerJid(jid: string | undefined): string | null {
    if (!jid?.endsWith(CALL_SERVER_SUFFIX)) return null
    const callId = jid.slice(0, -CALL_SERVER_SUFFIX.length)
    return callId ? callId : null
}
