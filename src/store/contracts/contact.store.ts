export interface WaStoredContactRecord {
    readonly jid: string
    readonly displayName?: string
    readonly pushName?: string
    readonly lid?: string
    readonly phoneNumber?: string
    readonly lastUpdatedMs: number
}

export interface WaContactStore {
    upsert(record: WaStoredContactRecord): Promise<void>
    upsertBatch(records: readonly WaStoredContactRecord[]): Promise<void>
    /**
     * Lookup by jid. Contacts are persisted in LID-canonical form when both
     * LID and PN are known (one row, `jid=<lid>` + `phoneNumber=<pn>`), so
     * passing the PN form falls through to {@link getByPhoneNumber} when no
     * row matches the PN jid directly. Callers do not need to know which
     * form was used to write the row.
     */
    getByJid(jid: string): Promise<WaStoredContactRecord | null>
    /**
     * Lookup the contact whose `phoneNumber` field equals `pn`. Returns the
     * LID-canonical row when the cross-reference is known, `null` otherwise.
     * Used by {@link getByJid} for the PN-fallback path and exposed publicly
     * for callers that already know the PN form.
     */
    getByPhoneNumber(pn: string): Promise<WaStoredContactRecord | null>
    deleteByJid(jid: string): Promise<number>
    clear(): Promise<void>
}
