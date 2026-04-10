/** Parser for `urn:xmpp:whatsapp:dirty` clear IQs. */

import type { BinaryNode } from '../../transport/codec'

export interface FakeClearedDirtyBit {
    readonly type: string
    readonly timestamp: number
}

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
