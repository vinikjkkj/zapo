import type { WaSessionStore } from '@store/contracts/session.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'
import type { WithDestroyLifecycle } from '@store/types'

/**
 * Read-through / write-through in-process cache for a persistent session
 * backend. Reuses {@link WaSessionMemoryStore} as the bounded-LRU L1 so that
 * repeated reads of the same peer on the send/recv path skip the backend
 * round-trip.
 *
 * Coherence model (single process):
 * - every mutation (set/delete/clear) writes the backend then the L1 in
 *   lock-step and bumps a generation counter;
 * - a read only populates the L1 when no mutation interleaved its backend
 *   fetch (generation unchanged) and the slot is still empty, so an in-flight
 *   read can never resurrect a concurrently deleted entry nor overwrite a
 *   fresher concurrent write;
 * - there is no negative caching: a miss always re-hits the backend.
 *
 * This cache assumes a single writer per `sessionId` (the library's
 * connection model). Do not share one backend across processes for the same
 * session with the cache enabled - there is no cross-process invalidation
 * channel, so another process's writes would leave this L1 stale.
 */
export function withSessionCache(
    backend: WaSessionStore,
    maxEntries?: number
): WithDestroyLifecycle<WaSessionStore> {
    const l1 = new WaSessionMemoryStore({ maxSessions: maxEntries })
    let generation = 0

    return {
        hasSession: async (address) => {
            if (await l1.hasSession(address)) return true
            return backend.hasSession(address)
        },
        hasSessions: (addresses) => backend.hasSessions(addresses),
        getSession: async (address) => {
            const cached = await l1.getSession(address)
            if (cached !== null) return cached
            const gen = generation
            const fetched = await backend.getSession(address)
            if (fetched !== null && gen === generation && (await l1.getSession(address)) === null) {
                await l1.setSession(address, fetched)
            }
            return fetched
        },
        getSessionsBatch: async (addresses) => {
            const cached = await l1.getSessionsBatch(addresses)
            const missing: number[] = []
            for (let i = 0; i < addresses.length; i += 1) {
                if (cached[i] === null) missing.push(i)
            }
            if (missing.length === 0) return cached
            const gen = generation
            const fetched = await backend.getSessionsBatch(missing.map((i) => addresses[i]))
            const coherent = gen === generation
            const result = cached.slice()
            for (let j = 0; j < missing.length; j += 1) {
                const record = fetched[j]
                result[missing[j]] = record
                if (
                    record !== null &&
                    coherent &&
                    (await l1.getSession(addresses[missing[j]])) === null
                ) {
                    await l1.setSession(addresses[missing[j]], record)
                }
            }
            return result
        },
        setSession: async (address, session) => {
            generation += 1
            await backend.setSession(address, session)
            await l1.setSession(address, session)
        },
        setSessionsBatch: async (entries) => {
            generation += 1
            await backend.setSessionsBatch(entries)
            await l1.setSessionsBatch(entries)
        },
        deleteSession: async (address) => {
            generation += 1
            await backend.deleteSession(address)
            await l1.deleteSession(address)
        },
        clear: async () => {
            generation += 1
            await backend.clear()
            await l1.clear()
        },
        destroy: async () => {
            await l1.clear()
            await (backend as WithDestroyLifecycle<WaSessionStore>).destroy?.()
        }
    }
}
