import { WA_MESSAGE_TYPES } from '@protocol/constants'
import { isGroupOrBroadcastJid } from '@protocol/jid'
import {
    findNodeChild,
    getNodeChildrenNonEmptyAttrValuesByTag,
    hasNodeChild
} from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'

interface ReceiptTarget {
    readonly chatJid: string
    readonly id: string
    readonly senderJid?: string
    readonly isGroupChat?: boolean
    readonly isBroadcastChat?: boolean
}

interface AggregatedReceiptGroup {
    readonly jid: string
    readonly ids: readonly string[]
    readonly participant?: string
}

function needsParticipant(target: ReceiptTarget): boolean {
    if (target.isGroupChat !== undefined || target.isBroadcastChat !== undefined) {
        return target.isGroupChat === true || target.isBroadcastChat === true
    }
    return isGroupOrBroadcastJid(target.chatJid)
}

export function aggregateReceiptTargets(
    targets: readonly ReceiptTarget[]
): readonly AggregatedReceiptGroup[] {
    const groups = new Map<string, { jid: string; participant?: string; ids: string[] }>()
    for (const target of targets) {
        const participant =
            needsParticipant(target) && target.senderJid && target.senderJid !== target.chatJid
                ? target.senderJid
                : undefined
        const key = `${target.chatJid}|${participant ?? ''}`
        let group = groups.get(key)
        if (!group) {
            group = { jid: target.chatJid, participant, ids: [] }
            groups.set(key, group)
        }
        group.ids.push(target.id)
    }
    return [...groups.values()]
}

/**
 * Resolves every message id a `<receipt>` acknowledges, mirroring WhatsApp
 * Web's `externalIds`. A batch receipt carries the extra ids in a
 * `<list><item id=.../>` block; the top-level `attrs.id` is just one of them.
 *
 * - `<list><item>` ids come first. For `type="view"` receipts the item key is
 *   `server_id` (not `id`), and the top-level id is NOT appended.
 * - Otherwise the top-level `attrs.id` is appended last.
 * - Aggregated receipts (carrying a `<participants>` child) are out of scope:
 *   their ids live in `<user>` children, so this falls back to the single
 *   top-level id for them.
 *
 * No dedup: matches wa-web, which pushes the top id without checking the list.
 */
export function extractReceiptIds(node: BinaryNode): readonly string[] {
    const topId = node.attrs.id
    if (hasNodeChild(node, 'participants')) {
        return topId ? [topId] : []
    }

    const isView = node.attrs.type === WA_MESSAGE_TYPES.RECEIPT_TYPE_VIEW
    const list = findNodeChild(node, 'list')
    const ids = list
        ? [...getNodeChildrenNonEmptyAttrValuesByTag(list, 'item', isView ? 'server_id' : 'id')]
        : []

    if (!isView && topId) {
        ids.push(topId)
    }
    return ids
}
