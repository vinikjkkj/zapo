import { isGroupJid } from '@protocol/jid'
import { WA_PRESENCE_LAST_SENTINELS, WA_PRESENCE_TYPES } from '@protocol/presence'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

export type IncomingPresenceType =
    | typeof WA_PRESENCE_TYPES.AVAILABLE
    | typeof WA_PRESENCE_TYPES.UNAVAILABLE

export type PresenceLastSeen =
    | { readonly kind: 'timestamp'; readonly unixSeconds: number }
    | { readonly kind: 'privacy_denied' }
    | { readonly kind: 'never_online' }
    | { readonly kind: 'unknown' }

interface ParsedPresence {
    readonly type: IncomingPresenceType
    readonly lastSeen?: PresenceLastSeen
    readonly groupOnlineCount?: number
}

function parseLastSeen(value: string): PresenceLastSeen {
    if (value === WA_PRESENCE_LAST_SENTINELS.DENY) {
        return { kind: 'privacy_denied' }
    }
    if (value === WA_PRESENCE_LAST_SENTINELS.NONE) {
        return { kind: 'never_online' }
    }
    if (value === WA_PRESENCE_LAST_SENTINELS.ERROR) {
        return { kind: 'unknown' }
    }
    const unixSeconds = parseOptionalInt(value)
    if (unixSeconds === undefined) {
        return { kind: 'unknown' }
    }
    return { kind: 'timestamp', unixSeconds }
}

export function parsePresenceNode(node: BinaryNode): ParsedPresence {
    const from = node.attrs.from
    const isGroup = from !== undefined && isGroupJid(from)
    const type: IncomingPresenceType =
        node.attrs.type === WA_PRESENCE_TYPES.UNAVAILABLE
            ? WA_PRESENCE_TYPES.UNAVAILABLE
            : WA_PRESENCE_TYPES.AVAILABLE

    const result: {
        type: IncomingPresenceType
        lastSeen?: PresenceLastSeen
        groupOnlineCount?: number
    } = { type }

    if (isGroup) {
        const count = parseOptionalInt(node.attrs.count)
        if (count !== undefined) {
            result.groupOnlineCount = count
        } else if (type === WA_PRESENCE_TYPES.UNAVAILABLE) {
            result.groupOnlineCount = 0
        }
        return result
    }

    if (type === WA_PRESENCE_TYPES.UNAVAILABLE && node.attrs.last !== undefined) {
        result.lastSeen = parseLastSeen(node.attrs.last)
    }
    return result
}
