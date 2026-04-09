/**
 * Parser for the `urn:xmpp:whatsapp:dirty` clear IQ.
 *
 * Source:
 *   /deobfuscated/WAWebDirty/WAWebClearDirtyBitsResponse.js
 *
 * Cross-checked against:
 *   src/transport/node/builders/account-sync.ts (`buildClearDirtyBitsIq`)
 *   src/client/dirty.ts (`clearDirtyBits`)
 *
 * Wire layout the lib emits:
 *
 *   <iq type="set" to="s.whatsapp.net" xmlns="urn:xmpp:whatsapp:dirty">
 *     <clean type="account_sync" timestamp="1700000000"/>
 *     <clean type="groups"        timestamp="1700000000"/>
 *     ...
 *   </iq>
 *
 * The lib's `clearDirtyBits` only awaits the response and swallows any
 * error, so a bare `<iq type="result"/>` is enough.
 */

import type { BinaryNode } from '../../transport/codec'

export interface FakeClearedDirtyBit {
    readonly type: string
    readonly timestamp: number
}

/**
 * Parses the inbound `<iq xmlns="urn:xmpp:whatsapp:dirty" type="set">`
 * stanza and returns the list of cleared bits, or `null` if the stanza
 * doesn't carry any `<clean>` children.
 */
export function parseClearDirtyBitsIq(
    iq: BinaryNode
): readonly FakeClearedDirtyBit[] | null {
    if (!Array.isArray(iq.content)) return null
    const out: FakeClearedDirtyBit[] = []
    for (const child of iq.content) {
        if (child.tag !== 'clean') continue
        const type = child.attrs.type
        const timestamp = child.attrs.timestamp
        if (!type || !timestamp) continue
        const parsed = Number.parseInt(timestamp, 10)
        if (!Number.isFinite(parsed)) continue
        out.push({ type, timestamp: parsed })
    }
    return out.length > 0 ? out : null
}
