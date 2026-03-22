import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from '@retry/types'

export interface WaRetryStore {
    getTtlMs?(): number
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
    incrementInboundCounter(
        messageId: string,
        requesterJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<number>
    cleanupExpired(nowMs: number): Promise<number>
    clear(): Promise<void>
}
