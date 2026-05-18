export interface WaGroupMetadataSnapshot {
    readonly groupJid: string
    readonly participants: readonly string[]
    readonly ephemeral?: number
    readonly updatedAtMs: number
}

export interface WaGroupMetadataStore {
    destroy?(): Promise<void>
    upsertGroupMetadata(snapshot: WaGroupMetadataSnapshot): Promise<void>
    getGroupMetadata(groupJid: string, nowMs?: number): Promise<WaGroupMetadataSnapshot | null>
    deleteGroupMetadata(groupJid: string): Promise<number>
    cleanupExpired(nowMs: number): Promise<number>
    clear(): Promise<void>
}
