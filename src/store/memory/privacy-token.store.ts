import type {
    WaPrivacyTokenStore,
    WaStoredPrivacyTokenRecord
} from '@store/contracts/privacy-token.store'
import { resolveOptionalPositive } from '@util/coercion'
import {
    createIdleExpiryIndex,
    createPeriodicCleanup,
    type IdleExpiryIndex,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

const DEFAULT_MAX_ENTRIES = 10_000

export interface WaPrivacyTokenMemoryStoreOptions {
    /**
     * Evicts a token record once it has been neither read nor written for
     * this many milliseconds; a periodic sweep reclaims it. Unset keeps
     * records until `maxEntries` evicts them.
     *
     * Meant for a cache in front of a persistent backend (the `cacheLayer`
     * L1), where an evicted entry is simply re-read. On a store that is the
     * source of truth, expiry forgets the peer's trusted-contact token.
     */
    readonly ttlMs?: number
}

export class WaPrivacyTokenMemoryStore implements WaPrivacyTokenStore {
    private readonly records: Map<string, WaStoredPrivacyTokenRecord>
    private readonly maxEntries: number
    private readonly idle: IdleExpiryIndex<string> | null
    private readonly cleanup: PeriodicCleanupHandle | null

    public constructor(
        maxEntries = DEFAULT_MAX_ENTRIES,
        options: WaPrivacyTokenMemoryStoreOptions = {}
    ) {
        this.records = new Map()
        this.maxEntries = maxEntries
        const ttlMs = resolveOptionalPositive(
            options.ttlMs,
            'WaPrivacyTokenMemoryStoreOptions.ttlMs'
        )
        this.idle = ttlMs === undefined ? null : createIdleExpiryIndex(ttlMs)
        this.cleanup =
            ttlMs === undefined
                ? null
                : createPeriodicCleanup(ttlMs, () => {
                      void this.cleanupExpired(Date.now())
                  })
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        const existing = this.records.get(record.jid)
        const merged = existing ? this.mergeRecord(existing, record) : record
        setBoundedMapEntry(this.records, record.jid, merged, this.maxEntries, this.idle?.delete)
        this.idle?.touch(record.jid, Date.now())
    }

    public async upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void> {
        const idle = this.idle
        const nowMs = idle === null ? 0 : Date.now()
        for (let i = 0; i < records.length; i += 1) {
            const record = records[i]
            const existing = this.records.get(record.jid)
            const merged = existing ? this.mergeRecord(existing, record) : record
            setBoundedMapEntry(this.records, record.jid, merged, this.maxEntries, idle?.delete)
            idle?.touch(record.jid, nowMs)
        }
    }

    public async getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null> {
        const record = this.records.get(jid)
        if (record === undefined) return null
        this.idle?.touch(jid, Date.now())
        return record
    }

    public async deleteByJid(jid: string): Promise<number> {
        this.idle?.delete(jid)
        return this.records.delete(jid) ? 1 : 0
    }

    public async clear(): Promise<void> {
        this.records.clear()
        this.idle?.clear()
    }

    /**
     * Evicts the records idle for at least `ttlMs` as of `nowMs` and returns
     * how many were evicted. Runs on a timer when `ttlMs` is set; a no-op
     * otherwise.
     */
    public async cleanupExpired(nowMs: number): Promise<number> {
        if (this.idle === null) return 0
        return this.idle.sweep(nowMs, (jid) => {
            this.records.delete(jid)
        })
    }

    public async destroy(): Promise<void> {
        this.cleanup?.destroy()
        await this.clear()
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
