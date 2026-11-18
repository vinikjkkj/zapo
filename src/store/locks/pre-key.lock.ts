import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import {
    hasPqPreKeyStore,
    type WaPqPreKeyStore,
    type WaPreKeyStore
} from '@store/contracts/pre-key.store'
import type { WithDestroyLifecycle } from '@store/types'

const WA_PREKEY_KEY = 'prekey:prekeys'
const WA_PREKEY_SERVER_KEY = 'prekey:serverHasPreKeys'
const WA_PREKEY_CLEAR_KEY = 'prekey:clear'
const WA_KYBER_PREKEY_KEY = 'prekey:kyber'
const WA_KYBER_PREKEY_CONSUME_PREFIX = 'prekey:kyber:consume:'
const WA_KYBER_PREKEY_COUNTER_KEY = 'prekey:kyber:counter'
const WA_PQ_MIGRATED_KEY = 'prekey:pqMigrated'
// consume is independent of the counter/generation and atomic in the store, so it
// uses a per-id key instead of WA_PREKEY_KEY: no queueing behind generation/upload.
const WA_PREKEY_CONSUME_PREFIX = 'prekey:consume:'

function lockPqPreKeyMethods(
    store: WaPqPreKeyStore,
    lock: StoreLock,
    gate: SharedExclusiveGate
): WaPqPreKeyStore {
    return {
        putKyberPreKeys: (records) =>
            gate.runShared(() =>
                lock.run(WA_KYBER_PREKEY_KEY, () => store.putKyberPreKeys(records))
            ),
        getKyberPreKeyById: (keyId) => gate.runShared(() => store.getKyberPreKeyById(keyId)),
        consumeKyberPreKeyById: (keyId) =>
            gate.runShared(() =>
                lock.run(`${WA_KYBER_PREKEY_CONSUME_PREFIX}${keyId}`, () =>
                    store.consumeKyberPreKeyById(keyId)
                )
            ),
        removeKyberPreKeys: (keyIds) =>
            gate.runShared(() =>
                lock.run(WA_KYBER_PREKEY_KEY, () => store.removeKyberPreKeys(keyIds))
            ),
        getLatestKyberLastResortKey: () =>
            gate.runShared(() => store.getLatestKyberLastResortKey()),
        reserveKyberPreKeyIds: (count) =>
            gate.runShared(() =>
                lock.run(WA_KYBER_PREKEY_COUNTER_KEY, () => store.reserveKyberPreKeyIds(count))
            ),
        getPqMigrated: () => gate.runShared(() => store.getPqMigrated()),
        setPqMigrated: (value) =>
            gate.runShared(() => lock.run(WA_PQ_MIGRATED_KEY, () => store.setPqMigrated(value)))
    }
}

/**
 * Serializes access to a pre-key store. The post-quantum methods are exposed
 * only when `store` has them, so the wrapper never advertises what it cannot do.
 */
export function withPreKeyLock(store: WaPreKeyStore): WithDestroyLifecycle<WaPreKeyStore> {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        ...(hasPqPreKeyStore(store) ? lockPqPreKeyMethods(store, lock, gate) : {}),
        putPreKey: (record) =>
            gate.runShared(() => lock.run(WA_PREKEY_KEY, () => store.putPreKey(record))),
        getOrGenPreKeys: (count, generator) =>
            gate.runShared(() =>
                lock.run(WA_PREKEY_KEY, () => store.getOrGenPreKeys(count, generator))
            ),
        getPreKeyById: (keyId) => gate.runShared(() => store.getPreKeyById(keyId)),
        getPreKeysById: (keyIds) => gate.runShared(() => store.getPreKeysById(keyIds)),
        consumePreKeyById: (keyId) =>
            gate.runShared(() =>
                lock.run(`${WA_PREKEY_CONSUME_PREFIX}${keyId}`, () =>
                    store.consumePreKeyById(keyId)
                )
            ),
        getOrGenSinglePreKey: (generator) =>
            gate.runShared(() =>
                lock.run(WA_PREKEY_KEY, () => store.getOrGenSinglePreKey(generator))
            ),
        markKeyAsUploaded: (keyId) =>
            gate.runShared(() => lock.run(WA_PREKEY_KEY, () => store.markKeyAsUploaded(keyId))),
        setServerHasPreKeys: (value) =>
            gate.runShared(() =>
                lock.run(WA_PREKEY_SERVER_KEY, () => store.setServerHasPreKeys(value))
            ),
        getServerHasPreKeys: () => gate.runShared(() => store.getServerHasPreKeys()),
        clear: () => gate.runExclusive(() => lock.run(WA_PREKEY_CLEAR_KEY, () => store.clear())),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
