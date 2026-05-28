import type { WaPrivacyTokenStore } from '@store/contracts/privacy-token.store'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import type { WithDestroyLifecycle } from '@store/types'

/**
 * Read-through cache for a persistent privacy-token backend. Reuses
 * {@link WaPrivacyTokenMemoryStore} as the bounded-LRU L1.
 *
 * Unlike the signal caches this is **invalidate-on-write, not
 * write-through**: `upsert` merges partial fields into the existing row on
 * the backend, so caching the partial incoming record would diverge from the
 * backend's merged result. Instead each upsert drops the L1 entry and the
 * next read re-populates from the merged backend truth. See
 * {@link withSessionCache} for the shared coherence model and the
 * single-writer-per-session assumption.
 */
export function withPrivacyTokenCache(
    backend: WaPrivacyTokenStore,
    maxEntries?: number
): WithDestroyLifecycle<WaPrivacyTokenStore> {
    const l1 = new WaPrivacyTokenMemoryStore(maxEntries)
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
            await l1.clear()
            await backend.destroy?.()
        }
    }
}
