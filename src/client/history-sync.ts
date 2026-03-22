import { promisify } from 'node:util'
import { unzip } from 'node:zlib'

import type { WaClientEventMap, WaHistorySyncChunkEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { proto, type Proto } from '@proto'
import type { WaContactStore, WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import type { WaStoredThreadRecord, WaThreadStore } from '@store/contracts/thread.store'
import { decodeProtoBytes, toBytesView } from '@util/bytes'
import { longToNumber } from '@util/primitives'

const unzipAsync = promisify(unzip)

const HANDLED_SYNC_TYPES = new Set([
    proto.Message.HistorySyncType.INITIAL_BOOTSTRAP,
    proto.Message.HistorySyncType.RECENT,
    proto.Message.HistorySyncType.FULL,
    proto.Message.HistorySyncType.PUSH_NAME
])

interface WaHistorySyncDeps {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly contactStore: WaContactStore
    readonly messageStore: WaMessageStore
    readonly threadStore: WaThreadStore
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
}

export async function processHistorySyncNotification(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<void> {
    const syncType = notification.syncType
    if (syncType === null || syncType === undefined || !HANDLED_SYNC_TYPES.has(syncType)) {
        deps.logger.debug('skipping unhandled history sync type', { syncType })
        return
    }

    const blob = await downloadHistorySyncBlob(deps, notification)
    const decompressed = toBytesView(await unzipAsync(blob))
    const historySync = proto.HistorySync.decode(decompressed)

    deps.logger.info('decoded history sync chunk', {
        syncType,
        chunkOrder: historySync.chunkOrder,
        progress: historySync.progress,
        conversations: historySync.conversations.length,
        pushnames: historySync.pushnames.length
    })

    const nowMs = Date.now()
    const contacts: WaStoredContactRecord[] = []
    for (const pn of historySync.pushnames) {
        if (!pn.id) {
            continue
        }
        contacts.push({
            jid: pn.id,
            pushName: pn.pushname ?? undefined,
            lastUpdatedMs: nowMs
        })
    }

    const threads: WaStoredThreadRecord[] = []
    const messages: WaStoredMessageRecord[] = []
    let messagesCount = 0
    for (const conversation of historySync.conversations) {
        const threadJid = conversation.id
        if (!threadJid) {
            deps.logger.debug('skipping history sync conversation without thread jid')
            continue
        }

        threads.push({
            jid: threadJid,
            name: conversation.name ?? undefined,
            unreadCount: conversation.unreadCount ?? undefined,
            archived: conversation.archived ?? undefined,
            pinned: conversation.pinned ?? undefined,
            muteEndMs: longToNumber(conversation.muteEndTime) || undefined,
            markedAsUnread: conversation.markedAsUnread ?? undefined,
            ephemeralExpiration: conversation.ephemeralExpiration ?? undefined
        })
        for (const histMsg of conversation.messages ?? []) {
            const webMsg = histMsg.message
            if (!webMsg?.key?.id) {
                continue
            }
            const timestampMs = longToNumber(webMsg.messageTimestamp) * 1000
            messages.push({
                id: webMsg.key.id,
                threadJid,
                senderJid: webMsg.key.participant ?? undefined,
                fromMe: webMsg.key.fromMe === true,
                timestampMs: timestampMs || undefined,
                messageBytes: webMsg.message
                    ? proto.Message.encode(webMsg.message).finish()
                    : undefined
            })
            messagesCount += 1
        }
    }

    await Promise.all([
        deps.contactStore.upsertBatch(contacts),
        deps.threadStore.upsertBatch(threads),
        deps.messageStore.upsertBatch(messages)
    ])

    const event: WaHistorySyncChunkEvent = {
        syncType,
        messagesCount,
        conversationsCount: historySync.conversations.length,
        pushnamesCount: historySync.pushnames.length,
        chunkOrder: historySync.chunkOrder ?? undefined,
        progress: historySync.progress ?? undefined
    }
    deps.emitEvent('history_sync_chunk', event)
}

async function downloadHistorySyncBlob(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<Uint8Array> {
    if (notification.initialHistBootstrapInlinePayload) {
        return decodeProtoBytes(
            notification.initialHistBootstrapInlinePayload,
            'initialHistBootstrapInlinePayload'
        )
    }
    if (!notification.directPath) {
        throw new Error('history sync notification missing directPath')
    }
    const mediaKey = decodeProtoBytes(notification.mediaKey, 'history sync mediaKey')
    const fileSha256 = decodeProtoBytes(notification.fileSha256, 'history sync fileSha256')
    const fileEncSha256 = decodeProtoBytes(notification.fileEncSha256, 'history sync fileEncSha256')
    return deps.mediaTransfer.downloadAndDecrypt({
        directPath: notification.directPath,
        mediaType: 'history',
        mediaKey,
        fileSha256,
        fileEncSha256
    })
}
