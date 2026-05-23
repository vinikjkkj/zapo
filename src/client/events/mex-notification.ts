import type {
    WaIncomingBaseEvent,
    WaMexLidChangeEvent,
    WaMexMessageCappingEvent,
    WaMexNotificationEvent,
    WaMexNotificationGraphQlError,
    WaMexOwnUsernameSyncEvent,
    WaMexTextStatusUpdateEvent,
    WaMexTextStatusUpdateHintEvent,
    WaMexUsernameDeleteEvent,
    WaMexUsernameSetEvent,
    WaMexUsernameUpdateHintEvent
} from '@client/types'
import { WA_NODE_TAGS } from '@protocol/nodes'
import { findNodeChild, getNodeTextContent } from '@transport/node/helpers'
import type { BinaryNode } from '@transport/types'
import { tryAsNumber, tryAsRecord, tryAsString } from '@util/coercion'

type MexNormalizerOutput =
    | Omit<WaMexUsernameSetEvent, keyof WaIncomingBaseEvent | 'errors'>
    | Omit<WaMexUsernameDeleteEvent, keyof WaIncomingBaseEvent | 'errors'>
    | Omit<WaMexUsernameUpdateHintEvent, keyof WaIncomingBaseEvent | 'errors'>
    | Omit<WaMexOwnUsernameSyncEvent, keyof WaIncomingBaseEvent | 'errors'>
    | Omit<WaMexTextStatusUpdateEvent, keyof WaIncomingBaseEvent | 'errors'>
    | Omit<WaMexTextStatusUpdateHintEvent, keyof WaIncomingBaseEvent | 'errors'>
    | Omit<WaMexLidChangeEvent, keyof WaIncomingBaseEvent | 'errors'>
    | Omit<WaMexMessageCappingEvent, keyof WaIncomingBaseEvent | 'errors'>

type MexNormalizer = (data: unknown) => MexNormalizerOutput | null

function normalizeUsernameSet(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(tryAsRecord(data)?.xwa2_notify_username_on_change)
    if (!payload) return null
    const username = tryAsString(payload.username)
    const lidJid = tryAsString(payload.lid)
    if (!username || !lidJid) return null
    return {
        kind: 'username_set',
        operationName: 'UsernameSetNotification',
        username,
        lidJid
    }
}

function normalizeUsernameDelete(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(tryAsRecord(data)?.xwa2_notify_username_delete)
    if (!payload) return null
    const lidJid = tryAsString(payload.lid)
    if (!lidJid) return null
    return {
        kind: 'username_delete',
        operationName: 'UsernameDeleteNotification',
        lidJid,
        displayName: tryAsString(payload.display_name)
    }
}

function normalizeUsernameUpdateHint(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(tryAsRecord(data)?.xwa2_notify_username_on_update_side_sub)
    if (!payload) return null
    const contactHash = tryAsString(payload.hash)
    if (!contactHash) return null
    return {
        kind: 'username_update_hint',
        operationName: 'UsernameUpdateNotification',
        contactHash
    }
}

function normalizeOwnUsernameSync(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(tryAsRecord(data)?.xwa2_notify_wa_user)
    if (!payload) return null
    const ownLidJid = tryAsString(payload.lid_jid)
    if (!ownLidJid) return null
    const info = tryAsRecord(payload.username_info)
    return {
        kind: 'own_username_sync',
        operationName: 'AccountSyncUsernameNotification',
        ownLidJid,
        username: info ? tryAsString(info.username) : null,
        state: info ? tryAsString(info.state) : null,
        pin: info ? tryAsString(info.pin) : null
    }
}

function normalizeTextStatusUpdate(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(tryAsRecord(data)?.xwa2_notify_text_status_on_update)
    if (!payload) return null
    const jid = tryAsString(payload.jid)
    if (!jid) return null
    const emojiNode = tryAsRecord(payload.emoji)
    return {
        kind: 'text_status_update',
        operationName: 'TextStatusUpdateNotification',
        jid,
        text: tryAsString(payload.text),
        emoji: emojiNode ? tryAsString(emojiNode.content) : null,
        ephemeralDurationSec: tryAsNumber(payload.ephemeral_duration_sec),
        lastUpdateTime: tryAsNumber(payload.last_update_time)
    }
}

function normalizeTextStatusUpdateHint(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(tryAsRecord(data)?.xwa2_notify_text_status_on_update_side_sub)
    if (!payload) return null
    const contactHash = tryAsString(payload.hash)
    if (!contactHash) return null
    return {
        kind: 'text_status_update_hint',
        operationName: 'TextStatusUpdateNotificationSideSub',
        contactHash
    }
}

function normalizeLidChange(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(tryAsRecord(data)?.xwa2_notify_lid_change)
    if (!payload) return null
    const oldLidJid = tryAsString(payload.old)
    const newLidJid = tryAsString(payload.new)
    if (!oldLidJid || !newLidJid) return null
    return {
        kind: 'lid_change',
        operationName: 'LidChangeNotification',
        oldLidJid,
        newLidJid
    }
}

function normalizeMessageCapping(data: unknown): MexNormalizerOutput | null {
    const payload = tryAsRecord(
        tryAsRecord(data)?.xwa2_notify_new_chat_messages_capping_info_update
    )
    if (!payload) return null
    const cappingStatus = tryAsString(payload.capping_status)
    if (!cappingStatus) return null
    return {
        kind: 'message_capping',
        operationName: 'MessageCappingInfoNotification',
        cappingStatus,
        oteStatus: tryAsString(payload.ote_status),
        mvStatus: tryAsString(payload.mv_status),
        totalQuota: tryAsNumber(payload.total_quota),
        usedQuota: tryAsNumber(payload.used_quota),
        cycleStartTimestamp: tryAsNumber(payload.cycle_start_timestamp),
        cycleEndTimestamp: tryAsNumber(payload.cycle_end_timestamp),
        serverSentTimestamp: tryAsNumber(payload.server_sent_timestamp)
    }
}

const OP_NORMALIZERS: Readonly<Record<string, MexNormalizer>> = {
    UsernameSetNotification: normalizeUsernameSet,
    UsernameDeleteNotification: normalizeUsernameDelete,
    UsernameUpdateNotification: normalizeUsernameUpdateHint,
    AccountSyncUsernameNotification: normalizeOwnUsernameSync,
    TextStatusUpdateNotification: normalizeTextStatusUpdate,
    TextStatusUpdateNotificationSideSub: normalizeTextStatusUpdateHint,
    LidChangeNotification: normalizeLidChange,
    MessageCappingInfoNotification: normalizeMessageCapping
}

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never
export type WaMexNotificationParsed = DistributiveOmit<
    WaMexNotificationEvent,
    keyof WaIncomingBaseEvent
>

export function parseMexNotification(node: BinaryNode): WaMexNotificationParsed | null {
    if (node.tag !== WA_NODE_TAGS.NOTIFICATION || node.attrs.type !== 'mex') return null
    const updateNode = findNodeChild(node, 'update')
    if (!updateNode) return null
    const operationName = updateNode.attrs.op_name as string | undefined
    if (!operationName) return null
    const payload = getNodeTextContent(updateNode)
    if (payload === undefined) return null
    let parsed: {
        readonly data?: unknown
        readonly errors?: readonly WaMexNotificationGraphQlError[]
    }
    try {
        parsed = JSON.parse(payload) as typeof parsed
    } catch {
        return null
    }
    const errors = parsed.errors ?? []
    const data = parsed.data ?? null

    const normalizer = OP_NORMALIZERS[operationName]
    if (normalizer) {
        const normalized = normalizer(data)
        if (normalized) {
            return { ...normalized, errors }
        }
    }
    return {
        kind: 'unknown',
        operationName,
        data,
        errors
    }
}
