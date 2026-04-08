/**
 * Builder for inbound `<presence/>` stanzas pushed by the server.
 *
 * Source:
 *   /deobfuscated/WAWebHandlePre/WAWebHandlePresence.js (top-level dispatcher)
 *   /deobfuscated/WASmaxInPresence/WASmaxInPresenceAvailableMixin.js
 *   /deobfuscated/WASmaxInPresence/WASmaxInPresenceUserUnavailableMixin.js
 *   /deobfuscated/WASmaxInPresence/WASmaxInPresenceLastSeenWithOtherValueMixin.js
 *
 * Wire layout
 * -----------
 *   <presence from="<jid>" type="available|unavailable" last="<unix-seconds | sentinel>"/>
 *
 * The `last` attribute is optional. When type is `unavailable` it usually
 * carries either a numeric unix timestamp (seconds) or one of the sentinels
 * `deny`, `none`, `error`. The lib does not parse these into typed fields
 * itself — it forwards the raw `BinaryNode` to the consumer via the
 * `incoming_presence` event — so the builder simply lets the caller pass
 * whichever shape the test wants to assert against.
 */

import type { BinaryNode } from '../../transport/codec'

export type FakePresenceType = 'available' | 'unavailable'
export type FakePresenceLastSentinel = 'deny' | 'none' | 'error'

export interface BuildIncomingPresenceInput {
    /** JID of the user (or group) the presence applies to. */
    readonly from: string
    /** Presence type — defaults to `available`. */
    readonly type?: FakePresenceType
    /** Optional `last` attribute. May be a unix-seconds number or a sentinel string. */
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
