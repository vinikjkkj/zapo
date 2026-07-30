import type {
    WaOfflineThreadMetadataEvent,
    WaOfflineThreadPreview,
    WaOfflineThreadReadWatermark
} from '@client/types'
import { findNodeChild, getNodeChildrenByTag } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { parseOptionalInt } from '@util/primitives'

const OFFLINE_THREAD_TAGS = Object.freeze({
    ITEM: 'item',
    WATERMARK: 'watermark',
    STATUS_MSGS: 'status_msgs',
    NOTIFICATIONS: 'notifications'
} as const)

function parseThreadPreviews(node: BinaryNode): readonly WaOfflineThreadPreview[] {
    const items = getNodeChildrenByTag(node, OFFLINE_THREAD_TAGS.ITEM)
    const previews: WaOfflineThreadPreview[] = []
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index]
        const jid = item.attrs.from
        const timestampSeconds = parseOptionalInt(item.attrs.t)
        if (!jid || timestampSeconds === undefined || timestampSeconds < 0) {
            continue
        }
        previews.push({ jid, timestampSeconds })
    }
    return previews
}

/** Keeps the highest `sts` per jid; non-positive means "no watermark", not "read at epoch". */
function parseReadWatermarks(
    node: BinaryNode
): readonly WaOfflineThreadReadWatermark[] | undefined {
    const watermarkNode = findNodeChild(node, OFFLINE_THREAD_TAGS.WATERMARK)
    if (!watermarkNode) {
        return undefined
    }
    const highestByJid = new Map<string, number>()
    const items = getNodeChildrenByTag(watermarkNode, OFFLINE_THREAD_TAGS.ITEM)
    for (let index = 0; index < items.length; index += 1) {
        const item = items[index]
        const jid = item.attrs.from
        const readTimestampSeconds = parseOptionalInt(item.attrs.sts)
        if (!jid || readTimestampSeconds === undefined || readTimestampSeconds <= 0) {
            continue
        }
        const current = highestByJid.get(jid)
        if (current === undefined || readTimestampSeconds > current) {
            highestByJid.set(jid, readTimestampSeconds)
        }
    }
    if (highestByJid.size === 0) {
        return undefined
    }
    const watermarks = new Array<WaOfflineThreadReadWatermark>(highestByJid.size)
    let index = 0
    for (const [jid, readTimestampSeconds] of highestByJid) {
        watermarks[index] = { jid, readTimestampSeconds }
        index += 1
    }
    return watermarks
}

function parsePendingStatusMessages(
    node: BinaryNode
): WaOfflineThreadMetadataEvent['pendingStatusMessages'] {
    const statusNode = findNodeChild(node, OFFLINE_THREAD_TAGS.STATUS_MSGS)
    if (!statusNode) {
        return undefined
    }
    const items = getNodeChildrenByTag(statusNode, OFFLINE_THREAD_TAGS.ITEM)
    const jids: string[] = []
    for (let index = 0; index < items.length; index += 1) {
        const jid = items[index].attrs.from
        if (jid) {
            jids.push(jid)
        }
    }
    return {
        count: parseOptionalInt(statusNode.attrs.count) ?? 0,
        jids
    }
}

function parsePendingNotifications(
    node: BinaryNode
): WaOfflineThreadMetadataEvent['pendingNotifications'] {
    const notificationsNode = findNodeChild(node, OFFLINE_THREAD_TAGS.NOTIFICATIONS)
    if (!notificationsNode) {
        return undefined
    }
    return { count: parseOptionalInt(notificationsNode.attrs.count) ?? 0 }
}

/**
 * Parses the offline preview manifest out of an `<ib>` bulletin. Every child
 * is optional: a bare node yields an empty `threads` list.
 *
 * @param node - the `<thread_metadata>` node, not the enclosing `<ib>`
 */
export function parseOfflineThreadMetadata(node: BinaryNode): WaOfflineThreadMetadataEvent {
    return {
        threads: parseThreadPreviews(node),
        readWatermarks: parseReadWatermarks(node),
        pendingStatusMessages: parsePendingStatusMessages(node),
        pendingNotifications: parsePendingNotifications(node)
    }
}
