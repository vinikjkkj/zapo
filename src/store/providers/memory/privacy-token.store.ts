import type {
    WaPrivacyTokenStore,
    WaStoredPrivacyTokenRecord
} from '@store/contracts/privacy-token.store'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_MAX_ENTRIES = 10_000

export class WaPrivacyTokenMemoryStore implements WaPrivacyTokenStore {
    private readonly records: Map<string, WaStoredPrivacyTokenRecord>
    private readonly maxEntries: number

    public constructor(maxEntries = DEFAULT_MAX_ENTRIES) {
        this.records = new Map()
        this.maxEntries = maxEntries
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        const existing = this.records.get(record.jid)
        const merged = existing ? this.mergeRecord(existing, record) : record
        setBoundedMapEntry(this.records, record.jid, merged, this.maxEntries)
    }

    public async upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void> {
        for (let i = 0; i < records.length; i += 1) {
            await this.upsert(records[i])
        }
    }

    public async getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null> {
        return this.records.get(jid) ?? null
    }

    public async deleteByJid(jid: string): Promise<number> {
        return this.records.delete(jid) ? 1 : 0
    }

    public async clear(): Promise<void> {
        this.records.clear()
    }

    public async destroy(): Promise<void> {
        this.records.clear()
    }

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
