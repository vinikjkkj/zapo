export interface WaStoredThreadRecord {
    readonly jid: string
    readonly name?: string
    readonly unreadCount?: number
    readonly archived?: boolean
    readonly pinned?: number
    readonly muteEndMs?: number
    readonly markedAsUnread?: boolean
    readonly ephemeralExpiration?: number
    /**
     * Unix seconds when disappearing mode was enabled for this chat.
     * History-sync `Conversation` delivers milliseconds; ingest converts to
     * seconds before persistence. Present only while the chat is ephemeral
     * (1:1). Groups do not use this field on outgoing messages.
     */
    readonly ephemeralSettingTimestamp?: number
}

export interface WaThreadStore {
    upsert(record: WaStoredThreadRecord): Promise<void>
    upsertBatch(records: readonly WaStoredThreadRecord[]): Promise<void>
    getByJid(jid: string): Promise<WaStoredThreadRecord | null>
    list(limit?: number): Promise<readonly WaStoredThreadRecord[]>
    deleteByJid(jid: string): Promise<number>
    clear(): Promise<void>
}
