/** History-sync message builders (inline and external blob variants). */

import { promisify } from 'node:util'
import { deflate } from 'node:zlib'

import { proto } from '../../transport/protos'

const deflateAsync = promisify(deflate)

export interface FakeHistorySyncConversation {
    readonly id: string
    readonly name?: string
    readonly unreadCount?: number
    readonly archived?: boolean
    readonly pinned?: number
    readonly muteEndTime?: number
    readonly markedAsUnread?: boolean
    readonly ephemeralExpiration?: number
    readonly messages?: readonly FakeHistorySyncWebMessage[]
}

export interface FakeHistorySyncWebMessage {
    readonly id: string
    readonly participant?: string
    readonly fromMe?: boolean
    readonly timestamp?: number
    readonly message?: proto.IMessage
}

export interface FakeHistorySyncPushname {
    readonly id: string
    readonly pushname?: string
}

export interface BuildHistorySyncInput {
    readonly syncType?: proto.Message.HistorySyncType
    readonly chunkOrder?: number
    readonly progress?: number
    readonly conversations?: readonly FakeHistorySyncConversation[]
    readonly pushnames?: readonly FakeHistorySyncPushname[]
    readonly nctSalt?: Uint8Array
}

export interface BuildHistorySyncExternalInput {
    readonly syncType?: proto.Message.HistorySyncType
    readonly chunkOrder?: number
    readonly progress?: number
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly fileLength?: number
}

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
