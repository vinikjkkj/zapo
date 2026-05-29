export interface WaDeviceListSnapshot {
    readonly userJid: string
    /**
     * The equivalent user-base JID in the other addressing form (PN if `userJid`
     * is LID and vice versa). Populated by the lid usync resolver at send time.
     * Used by retry-receipt eligibility to match the same user across
     * `@s.whatsapp.net` and `@lid` forms.
     */
    readonly altUserJid?: string
    readonly deviceJids: readonly string[]
    readonly updatedAtMs: number
}

export interface WaDeviceListStore {
    destroy?(): Promise<void>
    upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void>
    getUserDevicesBatch(
        userJids: readonly string[],
        nowMs?: number
    ): Promise<readonly (WaDeviceListSnapshot | null)[]>
    /**
     * Resolves a snapshot by either `userJid` (primary) or `altUserJid`
     * (alternate addressing). Returns the snapshot whose user matches `jid` in
     * either form, or `null` when unknown / expired.
     */
    findByAnyUserJid(jid: string, nowMs?: number): Promise<WaDeviceListSnapshot | null>
    deleteUserDevices(userJid: string): Promise<number>
    cleanupExpired(nowMs: number): Promise<number>
    clear(): Promise<void>
}
