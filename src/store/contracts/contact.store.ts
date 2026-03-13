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
    getByJid(jid: string): Promise<WaStoredContactRecord | null>
    deleteByJid(jid: string): Promise<number>
    clear(): Promise<void>
}
