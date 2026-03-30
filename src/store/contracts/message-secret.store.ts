export interface WaMessageSecretStore {
    get(messageId: string, nowMs?: number): Promise<Uint8Array | null>
    getBatch(messageIds: readonly string[], nowMs?: number): Promise<readonly (Uint8Array | null)[]>
    set(messageId: string, secret: Uint8Array): Promise<void>
    setBatch(
        entries: readonly { readonly messageId: string; readonly secret: Uint8Array }[]
    ): Promise<void>
    cleanupExpired(nowMs: number): Promise<number>
    clear(): Promise<void>
    destroy?(): Promise<void>
}
