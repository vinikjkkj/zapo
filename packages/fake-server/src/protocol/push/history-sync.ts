/**
 * Builders for history-sync notifications the lib processes via its
 * `protocolMessage.historySyncNotification` handler.
 *
 * Source:
 *   /deobfuscated/pb/WAWebProtobufsHistorySync_pb.js
 *   /deobfuscated/WAWebHistorySyncEvents/*.js
 *
 * The lib's `processHistorySyncNotification` (src/client/history-sync.ts)
 * accepts two delivery shapes:
 *
 *   1. **Inline payload** — `initialHistBootstrapInlinePayload` carries the
 *      zlib-compressed `HistorySync` proto bytes directly. This is what the
 *      Web client receives during the first chunk of a fresh pairing.
 *
 *   2. **External blob** — `directPath` + `mediaKey` + `fileSha256` +
 *      `fileEncSha256` point at an encrypted blob the client downloads
 *      from the media CDN. The fake server doesn't have a media CDN, so
 *      we always use shape (1).
 *
 * The decompressed `HistorySync` carries `conversations`, `pushnames`,
 * `chunkOrder`, `progress` and `nctSalt`. The lib persists conversations
 * and pushnames via the writeBehind layer and emits a single
 * `history_sync_chunk` event per call.
 */

import { promisify } from 'node:util'
import { deflate } from 'node:zlib'

import { proto } from '../../transport/protos'

const deflateAsync = promisify(deflate)

export interface FakeHistorySyncConversation {
    /** JID of the conversation (`5511999999999@s.whatsapp.net`, `120363...@g.us`). */
    readonly id: string
    readonly name?: string
    readonly unreadCount?: number
    readonly archived?: boolean
    readonly pinned?: number
    readonly muteEndTime?: number
    readonly markedAsUnread?: boolean
    readonly ephemeralExpiration?: number
    /** Optional WebMessageInfo entries to push into the conversation. */
    readonly messages?: readonly FakeHistorySyncWebMessage[]
}

export interface FakeHistorySyncWebMessage {
    readonly id: string
    /** Sender device jid (group case). */
    readonly participant?: string
    readonly fromMe?: boolean
    /** Unix-seconds. */
    readonly timestamp?: number
    /** Plain `Message` proto carried by the WebMessageInfo wrapper. */
    readonly message?: proto.IMessage
}

export interface FakeHistorySyncPushname {
    readonly id: string
    readonly pushname?: string
}

export interface BuildHistorySyncInput {
    /** Defaults to `INITIAL_BOOTSTRAP`. */
    readonly syncType?: proto.Message.HistorySyncType
    /** Defaults to `0`. */
    readonly chunkOrder?: number
    /** Defaults to `100`. */
    readonly progress?: number
    readonly conversations?: readonly FakeHistorySyncConversation[]
    readonly pushnames?: readonly FakeHistorySyncPushname[]
    /** Optional `nctSalt` payload (the lib forwards it to the privacy callback). */
    readonly nctSalt?: Uint8Array
}

/**
 * External-blob variant: instead of inlining the compressed bytes, the
 * notification points the lib at a downloadable encrypted blob via
 * `directPath` + `mediaKey` + `fileSha256` + `fileEncSha256`. The
 * caller is responsible for actually publishing those bytes (e.g.
 * via `FakeWaServer.publishMediaBlob`) so the lib's media transfer
 * client can fetch + decrypt them.
 */
export interface BuildHistorySyncExternalInput {
    readonly syncType?: proto.Message.HistorySyncType
    readonly chunkOrder?: number
    readonly progress?: number
    /** Absolute URL the lib should GET (e.g. `http://127.0.0.1:port/...`). */
    readonly directPath: string
    /** 32-byte media key used to derive AES/IV/HMAC keys. */
    readonly mediaKey: Uint8Array
    /** SHA-256 of the plaintext (used for post-decrypt integrity check). */
    readonly fileSha256: Uint8Array
    /** SHA-256 of the encrypted blob (used for pre-decrypt integrity check). */
    readonly fileEncSha256: Uint8Array
    /** Length of the encrypted blob in bytes. */
    readonly fileLength?: number
}

/**
 * Encodes the input as a `HistorySync` proto, zlib-compresses it, and wraps
 * it inside a `Message.HistorySyncNotification` carrying the inline payload.
 *
 * Returns a `proto.IMessage` ready to be encrypted and pushed by a
 * `FakePeer`.
 */
export async function buildHistorySyncMessage(
    input: BuildHistorySyncInput = {}
): Promise<proto.IMessage> {
    const syncType = input.syncType ?? proto.Message.HistorySyncType.INITIAL_BOOTSTRAP
    const conversations = (input.conversations ?? []).map((conversation) => ({
        id: conversation.id,
        name: conversation.name,
        unreadCount: conversation.unreadCount,
        archived: conversation.archived,
        pinned: conversation.pinned,
        muteEndTime: conversation.muteEndTime,
        markedAsUnread: conversation.markedAsUnread,
        ephemeralExpiration: conversation.ephemeralExpiration,
        messages: (conversation.messages ?? []).map((histMsg) => ({
            message: {
                key: {
                    id: histMsg.id,
                    fromMe: histMsg.fromMe ?? false,
                    remoteJid: conversation.id,
                    participant: histMsg.participant
                },
                messageTimestamp: histMsg.timestamp,
                message: histMsg.message
            }
        }))
    }))
    const pushnames = (input.pushnames ?? []).map((entry) => ({
        id: entry.id,
        pushname: entry.pushname
    }))

    // The outer `HistorySync` enum and the inner `Message.HistorySyncType`
    // share the same numeric values but are nominally distinct in the
    // generated TS types — cast through `number` to feed the same value
    // to both encoders.
    const historySync = proto.HistorySync.encode({
        syncType: syncType as unknown as proto.HistorySync.HistorySyncType,
        chunkOrder: input.chunkOrder ?? 0,
        progress: input.progress ?? 100,
        conversations,
        pushnames,
        nctSalt: input.nctSalt
    }).finish()
    const compressed = await deflateAsync(historySync)

    return {
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION,
            historySyncNotification: {
                syncType,
                chunkOrder: input.chunkOrder ?? 0,
                progress: input.progress ?? 100,
                initialHistBootstrapInlinePayload: new Uint8Array(compressed)
            }
        }
    }
}

/**
 * Encodes the same `HistorySync` proto `buildHistorySyncMessage` would
 * inline, but returns the **zlib-compressed plaintext bytes** so the
 * caller can publish them as an external media blob via
 * `FakeWaServer.publishMediaBlob({ mediaType: 'history', plaintext })`.
 */
export async function encodeHistorySyncPlaintext(
    input: BuildHistorySyncInput = {}
): Promise<Uint8Array> {
    const syncType = input.syncType ?? proto.Message.HistorySyncType.INITIAL_BOOTSTRAP
    const conversations = (input.conversations ?? []).map((conversation) => ({
        id: conversation.id,
        name: conversation.name,
        unreadCount: conversation.unreadCount,
        archived: conversation.archived,
        pinned: conversation.pinned,
        muteEndTime: conversation.muteEndTime,
        markedAsUnread: conversation.markedAsUnread,
        ephemeralExpiration: conversation.ephemeralExpiration,
        messages: (conversation.messages ?? []).map((histMsg) => ({
            message: {
                key: {
                    id: histMsg.id,
                    fromMe: histMsg.fromMe ?? false,
                    remoteJid: conversation.id,
                    participant: histMsg.participant
                },
                messageTimestamp: histMsg.timestamp,
                message: histMsg.message
            }
        }))
    }))
    const pushnames = (input.pushnames ?? []).map((entry) => ({
        id: entry.id,
        pushname: entry.pushname
    }))
    const historySync = proto.HistorySync.encode({
        syncType: syncType as unknown as proto.HistorySync.HistorySyncType,
        chunkOrder: input.chunkOrder ?? 0,
        progress: input.progress ?? 100,
        conversations,
        pushnames,
        nctSalt: input.nctSalt
    }).finish()
    const compressed = await deflateAsync(historySync)
    return new Uint8Array(compressed)
}

/**
 * External-blob counterpart of `buildHistorySyncMessage`. Wraps the
 * supplied media blob descriptor inside a `historySyncNotification`
 * carrying `directPath`/`mediaKey`/`fileSha256`/`fileEncSha256` (and
 * **no** `initialHistBootstrapInlinePayload`). The lib's
 * `processHistorySyncNotification` falls through to its
 * `mediaTransfer.downloadAndDecrypt` path with `mediaType: 'history'`.
 */
export function buildHistorySyncExternalMessage(
    input: BuildHistorySyncExternalInput
): proto.IMessage {
    const syncType = input.syncType ?? proto.Message.HistorySyncType.INITIAL_BOOTSTRAP
    return {
        protocolMessage: {
            type: proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION,
            historySyncNotification: {
                syncType,
                chunkOrder: input.chunkOrder ?? 0,
                progress: input.progress ?? 100,
                directPath: input.directPath,
                mediaKey: input.mediaKey,
                fileSha256: input.fileSha256,
                fileEncSha256: input.fileEncSha256,
                fileLength: input.fileLength
            }
        }
    }
}
