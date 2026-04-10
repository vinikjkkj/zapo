/** Builder for inbound `<presence/>` stanzas. */

import type { BinaryNode } from '../../transport/codec'

export type FakePresenceType = 'available' | 'unavailable'
export type FakePresenceLastSentinel = 'deny' | 'none' | 'error'

export interface BuildIncomingPresenceInput {
    readonly from: string
    readonly type?: FakePresenceType
    readonly last?: number | FakePresenceLastSentinel
}

export function buildIncomingPresence(input: BuildIncomingPresenceInput): BinaryNode {
    const attrs: Record<string, string> = {
        from: input.from,
        type: input.type ?? 'available'
    }
    if (input.last !== undefined) {
        attrs.last = typeof input.last === 'number' ? String(input.last) : input.last
    }
    return {
        tag: 'presence',
        attrs
    }
}
