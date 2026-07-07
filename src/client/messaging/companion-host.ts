import { promisify } from 'node:util'
import { deflate } from 'node:zlib'

import { type Proto, proto } from '@proto'

const deflateAsync = promisify(deflate)

/** A PN→LID mapping carried inside a history sync (one per chat peer with a LID). */
export interface PhoneNumberToLidMapping {
    readonly pnJid: string
    readonly lidJid: string
}

export interface HistorySyncBootstrapInput {
    /**
     * Chat-peer PN→LID pairs (the primary's own account excluded, only peers
     * resolving to a LID). A fresh account with no chats yields an empty list.
     */
    readonly phoneNumberToLidMappings?: readonly PhoneNumberToLidMapping[]
    readonly conversations?: readonly Proto.IConversation[]
    readonly pushnames?: readonly Proto.IPushname[]
    /** The companion pairing session id, echoed so the companion can bind it. */
    readonly companionMetaNonce?: string
}

/**
 * Serializes a `HistorySync` and zlib-deflates it. The phone uses DEFLATE
 * level 1; any zlib-framed level inflates identically, so it is only a
 * size/speed tradeoff.
 */
export async function encodeHistorySync(content: Proto.IHistorySync): Promise<Uint8Array> {
    const serialized = proto.HistorySync.encode(content).finish()
    const compressed = await deflateAsync(serialized, { level: 1 })
    return new Uint8Array(compressed)
}

/**
 * Wraps a deflated `HistorySync` inline in a `HISTORY_SYNC_NOTIFICATION` protocol
 * message. Only small syncs are inlined; larger ones ride an external
 * `md-msg-hist` MMS blob referenced by the same notification.
 */
export function buildInlineHistorySyncNotification(
    syncType: Proto.Message.HistorySyncType,
    deflatedPayload: Uint8Array,
    options: { readonly chunkOrder?: number; readonly progress?: number } = {}
): Proto.Message.IProtocolMessage {
    return {
        type: proto.Message.ProtocolMessage.Type.HISTORY_SYNC_NOTIFICATION,
        historySyncNotification: {
            syncType,
            chunkOrder: options.chunkOrder ?? 0,
            progress: options.progress ?? 100,
            initialHistBootstrapInlinePayload: deflatedPayload
        }
    }
}

/**
 * Builds the `INITIAL_BOOTSTRAP` `HISTORY_SYNC_NOTIFICATION` a mobile-primary
 * pushes to a freshly-linked companion: a deflated `HistorySync` wrapped in a
 * protocol message for delivery as an encrypted peer message. Note
 * `HistorySync.syncType` and `HistorySyncNotification.syncType` are distinct
 * enum types with shared values, so each field uses its own.
 */
export async function buildHistorySyncBootstrapMessage(
    input: HistorySyncBootstrapInput = {}
): Promise<{ readonly message: Proto.Message.IProtocolMessage; readonly payloadBytes: number }> {
    const historySync: Proto.IHistorySync = {
        syncType: proto.HistorySync.HistorySyncType.INITIAL_BOOTSTRAP,
        chunkOrder: 0,
        progress: 100,
        conversations: input.conversations ? [...input.conversations] : [],
        pushnames: input.pushnames ? [...input.pushnames] : [],
        phoneNumberToLidMappings: (input.phoneNumberToLidMappings ?? []).map((mapping) => ({
            pnJid: mapping.pnJid,
            lidJid: mapping.lidJid
        })),
        ...(input.companionMetaNonce !== undefined
            ? { companionMetaNonce: input.companionMetaNonce }
            : {})
    }
    const payload = await encodeHistorySync(historySync)
    const message = buildInlineHistorySyncNotification(
        proto.Message.HistorySyncType.INITIAL_BOOTSTRAP,
        payload
    )
    return { message, payloadBytes: payload.byteLength }
}
