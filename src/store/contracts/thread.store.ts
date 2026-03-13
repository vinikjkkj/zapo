export interface WaStoredThreadRecord {
    readonly jid: string
    readonly name?: string
    readonly unreadCount?: number
    readonly archived?: boolean
    readonly pinned?: number
    readonly muteEndMs?: number
    readonly markedAsUnread?: boolean
    readonly ephemeralExpiration?: number
}

export interface WaThreadStore {
    upsert(record: WaStoredThreadRecord): Promise<void>
    getByJid(jid: string): Promise<WaStoredThreadRecord | null>
    list(limit?: number): Promise<readonly WaStoredThreadRecord[]>
    deleteByJid(jid: string): Promise<number>
    clear(): Promise<void>
}
