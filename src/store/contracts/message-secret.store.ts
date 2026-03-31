export interface WaMessageSecretEntry {
    readonly secret: Uint8Array
    readonly senderJid: string
}

export interface WaMessageSecretStore {
    get(messageId: string, nowMs?: number): Promise<WaMessageSecretEntry | null>
    getBatch(
        messageIds: readonly string[],
        nowMs?: number
    ): Promise<readonly (WaMessageSecretEntry | null)[]>
    set(messageId: string, entry: WaMessageSecretEntry): Promise<void>
    setBatch(
        entries: readonly { readonly messageId: string; readonly entry: WaMessageSecretEntry }[]
    ): Promise<void>
    cleanupExpired(nowMs: number): Promise<number>
    clear(): Promise<void>
    destroy?(): Promise<void>
}
