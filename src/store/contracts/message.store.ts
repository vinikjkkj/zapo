export interface WaStoredMessageRecord {
    readonly id: string
    readonly threadJid: string
    readonly senderJid?: string
    readonly participantJid?: string
    readonly fromMe: boolean
    readonly timestampMs?: number
    readonly encType?: string
    readonly plaintext?: Uint8Array
    readonly messageBytes?: Uint8Array
}

export interface WaMessageStore {
    upsert(record: WaStoredMessageRecord): Promise<void>
    getById(id: string): Promise<WaStoredMessageRecord | null>
    listByThread(
        threadJid: string,
        limit?: number,
        beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]>
    deleteById(id: string): Promise<number>
    clear(): Promise<void>
}
