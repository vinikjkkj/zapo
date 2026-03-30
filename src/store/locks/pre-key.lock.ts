import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WithDestroyLifecycle } from '@store/types'

const WA_PREKEY_KEY = 'prekey:prekeys'
const WA_PREKEY_SERVER_KEY = 'prekey:serverHasPreKeys'
const WA_PREKEY_CLEAR_KEY = 'prekey:clear'

export function withPreKeyLock(store: WaPreKeyStore): WithDestroyLifecycle<WaPreKeyStore> {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        putPreKey: (record) =>
            gate.runShared(() => lock.run(WA_PREKEY_KEY, () => store.putPreKey(record))),
        getOrGenPreKeys: (count, generator) =>
            gate.runShared(() =>
                lock.run(WA_PREKEY_KEY, () => store.getOrGenPreKeys(count, generator))
            ),
        getPreKeyById: (keyId) => gate.runShared(() => store.getPreKeyById(keyId)),
        getPreKeysById: (keyIds) => gate.runShared(() => store.getPreKeysById(keyIds)),
        consumePreKeyById: (keyId) =>
            gate.runShared(() => lock.run(WA_PREKEY_KEY, () => store.consumePreKeyById(keyId))),
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
