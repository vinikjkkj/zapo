export interface WaStoredPrivacyTokenRecord {
    readonly jid: string
    readonly tcToken?: Uint8Array
    readonly tcTokenTimestamp?: number
    readonly tcTokenSenderTimestamp?: number
    readonly nctSalt?: Uint8Array
    readonly updatedAtMs: number
}

export interface WaPrivacyTokenStore {
    upsert(record: WaStoredPrivacyTokenRecord): Promise<void>
    upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void>
    getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null>
    deleteByJid(jid: string): Promise<number>
    clear(): Promise<void>
    destroy?(): Promise<void>
}
