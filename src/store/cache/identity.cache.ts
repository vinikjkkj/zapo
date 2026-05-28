import type { WaIdentityStore } from '@store/contracts/identity.store'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import type { WithDestroyLifecycle } from '@store/types'

/**
 * Read-through / write-through in-process cache for a persistent remote
 * identity backend. Reuses {@link WaIdentityMemoryStore} as the bounded-LRU
 * L1. Remote identities are read alongside sessions on the send path (the
 * identity-mismatch guard), so caching them complements
 * {@link withSessionCache}.
 *
 * The identity store has no per-key delete: identities are overwritten on
 * re-establishment, so a peer's key change propagates through the
 * write-through `setRemoteIdentity`. See {@link withSessionCache} for the
 * shared coherence model and the single-writer-per-session assumption.
 */
export function withIdentityCache(
    backend: WaIdentityStore,
    maxEntries?: number
): WithDestroyLifecycle<WaIdentityStore> {
    const l1 = new WaIdentityMemoryStore({ maxRemoteIdentities: maxEntries })
    let generation = 0

    return {
        getRemoteIdentity: async (address) => {
            const cached = await l1.getRemoteIdentity(address)
            if (cached !== null) return cached
            const gen = generation
            const fetched = await backend.getRemoteIdentity(address)
            if (
                fetched !== null &&
                gen === generation &&
                (await l1.getRemoteIdentity(address)) === null
            ) {
                await l1.setRemoteIdentity(address, fetched)
            }
            return fetched
        },
        getRemoteIdentities: async (addresses) => {
            const cached = await l1.getRemoteIdentities(addresses)
            const missing: number[] = []
            for (let i = 0; i < addresses.length; i += 1) {
                if (cached[i] === null) missing.push(i)
            }
            if (missing.length === 0) return cached
            const gen = generation
            const fetched = await backend.getRemoteIdentities(missing.map((i) => addresses[i]))
            const coherent = gen === generation
            const result = cached.slice()
            for (let j = 0; j < missing.length; j += 1) {
                const key = fetched[j]
                result[missing[j]] = key
                if (
                    key !== null &&
                    coherent &&
                    (await l1.getRemoteIdentity(addresses[missing[j]])) === null
                ) {
                    await l1.setRemoteIdentity(addresses[missing[j]], key)
                }
            }
            return result
        },
        setRemoteIdentity: async (address, identityKey) => {
            generation += 1
            await backend.setRemoteIdentity(address, identityKey)
            await l1.setRemoteIdentity(address, identityKey)
        },
        setRemoteIdentities: async (entries) => {
            generation += 1
            await backend.setRemoteIdentities(entries)
            await l1.setRemoteIdentities(entries)
        },
        clear: async () => {
            generation += 1
            await backend.clear()
            await l1.clear()
        },
        destroy: async () => {
            await l1.clear()
            await (backend as WithDestroyLifecycle<WaIdentityStore>).destroy?.()
        }
    }
}
