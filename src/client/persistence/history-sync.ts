import { promisify } from 'node:util'
import { unzip } from 'node:zlib'

import type { WriteBehindPersistence } from '@client/persistence/WriteBehindPersistence'
import type { WaClientEventMap, WaHistorySyncChunkEvent } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import { proto, type Proto } from '@proto'
import { decodeProtoBytes, toBytesView } from '@util/bytes'
import { longToNumber, toError } from '@util/primitives'

const unzipAsync = promisify(unzip)

const HANDLED_SYNC_TYPES = new Set([
    proto.Message.HistorySyncType.INITIAL_BOOTSTRAP,
    proto.Message.HistorySyncType.RECENT,
    proto.Message.HistorySyncType.FULL,
    proto.Message.HistorySyncType.PUSH_NAME,
    proto.Message.HistorySyncType.ON_DEMAND,
    proto.Message.HistorySyncType.NON_BLOCKING_DATA
])
const HISTORY_SYNC_MAX_PENDING_WRITES = 1_024

interface WaHistorySyncDeps {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly writeBehind: WriteBehindPersistence
    readonly emitEvent: <K extends keyof WaClientEventMap>(
        event: K,
        ...args: Parameters<WaClientEventMap[K]>
    ) => void
    readonly onPrivacyTokens?: (
        conversations: readonly {
            readonly jid: string
            readonly tcToken?: Uint8Array | null
            readonly tcTokenTimestamp?: number | null
            readonly tcTokenSenderTimestamp?: number | null
        }[]
    ) => Promise<void>
    readonly onNctSalt?: (salt: Uint8Array) => Promise<void>
    /**
     * Invoked once per recognized chunk after it has been fully processed (or
     * after the early-return for `INITIAL_STATUS_V3` and other recognized-but-
     * unhandled types). The WaClient wires this to the `hist_sync` receipt
     * stanza required by wa-web so the primary device does not keep resending
     * the same chunk.
     */
    readonly onProcessed?: (syncType: Proto.Message.HistorySyncType) => Promise<void>
}

export async function runHistorySyncNotification(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<void> {
    try {
        await processHistorySyncNotification(deps, notification)
    } catch (error) {
        deps.logger.warn('failed to process history sync notification', {
            syncType: notification.syncType,
            chunkOrder: notification.chunkOrder,
            message: toError(error).message
        })
    }
}

export async function processHistorySyncNotification(
    deps: WaHistorySyncDeps,
    notification: Proto.Message.IHistorySyncNotification
): Promise<void> {
    const syncType = notification.syncType
    if (syncType === null || syncType === undefined) {
        deps.logger.debug('skipping history sync notification without syncType')
        return
    }
    if (!HANDLED_SYNC_TYPES.has(syncType)) {
        deps.logger.debug('skipping unhandled history sync type', { syncType })
        // INITIAL_STATUS_V3 is the only recognized syncType we do not process today;
        // still ack it so the primary device does not keep resending the same chunk.
        if (syncType === proto.Message.HistorySyncType.INITIAL_STATUS_V3 && deps.onProcessed) {
            await deps.onProcessed(syncType)
        }
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
    const pendingWrites: Promise<void>[] = []

    // Build PN -> LID lookup from this chunk's mappings so pushnames and
    // mappings land on a single canonical (LID-form) contact row instead of
    // two mirror rows (one keyed by PN, one keyed by LID).
    const pnToLid = new Map<string, string>()
    for (const map of historySync.phoneNumberToLidMappings ?? []) {
        if (map.pnJid && map.lidJid) {
            pnToLid.set(map.pnJid, map.lidJid)
        }
    }

    for (const pn of historySync.pushnames) {
        if (!pn.id) {
            continue
        }
        const lidJid = pnToLid.get(pn.id)
        pendingWrites[pendingWrites.length] = deps.writeBehind.persistContactAsync(
            lidJid
                ? {
                      jid: lidJid,
                      pushName: pn.pushname ?? undefined,
                      phoneNumber: pn.id,
                      lastUpdatedMs: nowMs
                  }
                : {
                      jid: pn.id,
                      pushName: pn.pushname ?? undefined,
                      lastUpdatedMs: nowMs
                  }
        )
        if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
            await flushPendingWrites(pendingWrites)
        }
    }

    let messagesCount = 0
    for (const conversation of historySync.conversations) {
        const threadJid = conversation.id
        if (!threadJid) {
            deps.logger.debug('skipping history sync conversation without thread jid')
            continue
        }

        pendingWrites[pendingWrites.length] = deps.writeBehind.persistThreadAsync({
            jid: threadJid,
            name: conversation.name ?? undefined,
            unreadCount: conversation.unreadCount ?? undefined,
            archived: conversation.archived ?? undefined,
            pinned: conversation.pinned ?? undefined,
            muteEndMs: longToNumber(conversation.muteEndTime) || undefined,
            markedAsUnread: conversation.markedAsUnread ?? undefined,
            ephemeralExpiration: conversation.ephemeralExpiration ?? undefined
        })
        if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
            await flushPendingWrites(pendingWrites)
        }
        for (const histMsg of conversation.messages ?? []) {
            const webMsg = histMsg.message
            if (!webMsg?.key?.id || !webMsg.message) {
                // Stubs (group system events: add/remove/promote, revokes, ephemeral toggles)
                // arrive as WebMessageInfo with a key + messageStubType but no `.message`. They
                // duplicate live `notification` stanzas that the client already processes, and
                // storing them as content-less rows produces "ghost" entries — skip them here.
                continue
            }
            const timestampMs = longToNumber(webMsg.messageTimestamp) * 1000
            pendingWrites[pendingWrites.length] = deps.writeBehind.persistMessageAsync({
                id: webMsg.key.id,
                threadJid,
                senderJid: webMsg.key.participant ?? undefined,
                fromMe: webMsg.key.fromMe === true,
                timestampMs: timestampMs || undefined,
                messageBytes: proto.Message.encode(webMsg.message).finish()
            })
            if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
                await flushPendingWrites(pendingWrites)
            }
            messagesCount += 1
        }
    }

    // Persist LID<->PN mappings as a single LID-canonical row per contact.
    // Lookups by PN form fall through to `getByPhoneNumber` via the secondary
    // index, so the mirror PN row is no longer needed.
    for (const [pnJid, lidJid] of pnToLid) {
        pendingWrites[pendingWrites.length] = deps.writeBehind.persistContactAsync({
            jid: lidJid,
            phoneNumber: pnJid,
            lastUpdatedMs: nowMs
        })
        if (pendingWrites.length >= HISTORY_SYNC_MAX_PENDING_WRITES) {
            await flushPendingWrites(pendingWrites)
        }
    }

    if (deps.onPrivacyTokens) {
        const tokenConversations: {
            readonly jid: string
            readonly tcToken?: Uint8Array | null
            readonly tcTokenTimestamp?: number | null
            readonly tcTokenSenderTimestamp?: number | null
        }[] = []
        for (const conversation of historySync.conversations) {
            if (!conversation.id) continue
            if (
                conversation.tcToken ||
                conversation.tcTokenTimestamp ||
                conversation.tcTokenSenderTimestamp
            ) {
                tokenConversations[tokenConversations.length] = {
                    jid: conversation.id,
                    tcToken: conversation.tcToken,
                    tcTokenTimestamp: longToNumber(conversation.tcTokenTimestamp) || undefined,
                    tcTokenSenderTimestamp:
                        longToNumber(conversation.tcTokenSenderTimestamp) || undefined
                }
            }
        }
        if (tokenConversations.length > 0) {
            pendingWrites[pendingWrites.length] = deps.onPrivacyTokens(tokenConversations)
        }
    }
    if (deps.onNctSalt && historySync.nctSalt) {
        pendingWrites[pendingWrites.length] = deps.onNctSalt(historySync.nctSalt)
    }

    const event: WaHistorySyncChunkEvent = {
        syncType,
        messagesCount,
        conversationsCount: historySync.conversations.length,
        pushnamesCount: historySync.pushnames.length,
        chunkOrder: historySync.chunkOrder ?? undefined,
        progress: historySync.progress ?? undefined
    }
    await flushPendingWrites(pendingWrites)
    deps.emitEvent('history_sync_chunk', event)
    if (deps.onProcessed) {
        await deps.onProcessed(syncType)
    }
}

async function flushPendingWrites(pendingWrites: Promise<void>[]): Promise<void> {
    if (pendingWrites.length === 0) {
        return
    }
    const settled = Promise.all(pendingWrites)
    pendingWrites.length = 0
    await settled
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
