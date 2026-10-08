import type {
    WaPrivacyTokenStore,
    WaStoredPrivacyTokenRecord
} from '@store/contracts/privacy-token.store'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_ENTRIES = 10_000

export class WaPrivacyTokenMemoryStore implements WaPrivacyTokenStore {
    protected readonly records: Map<string, WaStoredPrivacyTokenRecord>
    private readonly maxEntries: number

    public constructor(maxEntries?: number) {
        this.records = new Map()
        this.maxEntries = resolvePositive(
            maxEntries,
            DEFAULT_MAX_ENTRIES,
            'WaPrivacyTokenMemoryStore.maxEntries'
        )
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        const existing = this.records.get(record.jid)
        const merged = existing ? this.mergeRecord(existing, record) : record
        setBoundedMapEntry(this.records, record.jid, merged, this.maxEntries, this.onEvict)
        this.onEntryAccess(record.jid)
    }

    public async upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void> {
        for (let i = 0; i < records.length; i += 1) {
            const record = records[i]
            const existing = this.records.get(record.jid)
            const merged = existing ? this.mergeRecord(existing, record) : record
            setBoundedMapEntry(this.records, record.jid, merged, this.maxEntries, this.onEvict)
            this.onEntryAccess(record.jid)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null> {
        const record = this.records.get(jid)
        if (record === undefined) return null
        this.onEntryAccess(jid)
        return record
    }

    public async deleteByJid(jid: string): Promise<number> {
        if (!this.records.delete(jid)) return 0
        this.onEntryRemove(jid)
        return 1
    }

    public async clear(): Promise<void> {
        this.records.clear()
        this.onEntriesClear()
    }

    public async destroy(): Promise<void> {
        await this.clear()
    }

    /** Runs with the jid of every read hit and write. No-op unless a subclass tracks access. */
    protected onEntryAccess(jid: string): void {}

    /** Runs with the jid of every deleted or cap-evicted record. */
    protected onEntryRemove(jid: string): void {}

    protected onEntriesClear(): void {}

    private readonly onEvict = (jid: string): void => this.onEntryRemove(jid)

    private mergeRecord(
        existing: WaStoredPrivacyTokenRecord,
        incoming: WaStoredPrivacyTokenRecord
    ): WaStoredPrivacyTokenRecord {
        return {
            jid: incoming.jid,
            tcToken: incoming.tcToken ?? existing.tcToken,
            tcTokenTimestamp: incoming.tcTokenTimestamp ?? existing.tcTokenTimestamp,
            tcTokenSenderTimestamp:
                incoming.tcTokenSenderTimestamp ?? existing.tcTokenSenderTimestamp,
            nctSalt: incoming.nctSalt ?? existing.nctSalt,
            updatedAtMs: incoming.updatedAtMs
        }
    }
}
