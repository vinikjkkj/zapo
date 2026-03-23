import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from '@retry/types'

export interface WaRetryStore {
    getOutboundRequesterStatus(
        messageId: string,
        requesterDeviceJid: string
    ): Promise<{
        readonly eligible: boolean
        readonly delivered: boolean
    } | null>
    getTtlMs?(): number
    supportsRawReplayPayload?(): boolean
    destroy?(): Promise<void>
    upsertOutboundMessage(record: WaRetryOutboundMessageRecord): Promise<void>
    deleteOutboundMessage(messageId: string): Promise<number>
    getOutboundMessage(messageId: string): Promise<WaRetryOutboundMessageRecord | null>
    updateOutboundMessageState(
        messageId: string,
        state: WaRetryOutboundState,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void>
    markOutboundRequesterDelivered(
        messageId: string,
        requesterDeviceJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void>
    incrementInboundCounter(
        messageId: string,
        requesterJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<number>
    cleanupExpired(nowMs: number): Promise<number>
    clear(): Promise<void>
}
