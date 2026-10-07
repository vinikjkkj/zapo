import type {
    WaPrivacyTokenStore,
    WaStoredPrivacyTokenRecord
} from '@store/contracts/privacy-token.store'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import type { WithDestroyLifecycle } from '@store/types'
import { type IdleExpiry, IdleExpiryIndex } from '@util/collections'

/** L1 with idle expiry; hits keep it in access order, so the cap evicts the LRU entry. */
class IdlePrivacyTokenMemoryStore extends WaPrivacyTokenMemoryStore {
    private readonly idle: IdleExpiryIndex<string, WaStoredPrivacyTokenRecord>

    public constructor(maxEntries: number | undefined, expiry: IdleExpiry) {
        super(maxEntries)
        this.idle = new IdleExpiryIndex(this.records, expiry)
    }

    public detach(): void {
        this.idle.detach()
    }

    protected override onEntryAccess(jid: string): void {
        this.idle.touch(jid)
    }

    protected override onEntryRemove(jid: string): void {
        this.idle.delete(jid)
    }

    protected override onEntriesClear(): void {
        this.idle.clear()
    }
}

/**
 * Read-through cache for a persistent privacy-token backend. Reuses
 * {@link WaPrivacyTokenMemoryStore} as the bounded L1.
 *
 * Unlike the signal caches this is **invalidate-on-write, not
 * write-through**: `upsert` merges partial fields into the existing row on
 * the backend, so caching the partial incoming record would diverge from the
 * backend's merged result. Instead each upsert drops the L1 entry and the
 * next read re-populates from the merged backend truth. See
 * {@link withSessionCache} for the shared coherence model, the
 * single-writer-per-session assumption and the eviction with and without
 * `expiry`.
 */
export function withPrivacyTokenCache(
    backend: WaPrivacyTokenStore,
    maxEntries?: number,
    expiry?: IdleExpiry
): WithDestroyLifecycle<WaPrivacyTokenStore> {
    const l1 = expiry
        ? new IdlePrivacyTokenMemoryStore(maxEntries, expiry)
        : new WaPrivacyTokenMemoryStore(maxEntries)
    let generation = 0

    return {
        upsert: async (record) => {
            generation += 1
            await backend.upsert(record)
            await l1.deleteByJid(record.jid)
        },
        upsertBatch: async (records) => {
            generation += 1
            await backend.upsertBatch(records)
            for (let i = 0; i < records.length; i += 1) {
                await l1.deleteByJid(records[i].jid)
            }
        },
        getByJid: async (jid) => {
            const cached = await l1.getByJid(jid)
            if (cached !== null) return cached
            const gen = generation
            const fetched = await backend.getByJid(jid)
            if (fetched !== null && gen === generation && (await l1.getByJid(jid)) === null) {
                await l1.upsert(fetched)
            }
            return fetched
        },
        deleteByJid: async (jid) => {
            generation += 1
            const deleted = await backend.deleteByJid(jid)
            await l1.deleteByJid(jid)
            return deleted
        },
        clear: async () => {
            generation += 1
            await backend.clear()
            await l1.clear()
        },
        destroy: async () => {
            if (l1 instanceof IdlePrivacyTokenMemoryStore) l1.detach()
            await l1.clear()
            await backend.destroy?.()
        }
    }
}
