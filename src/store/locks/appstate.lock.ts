import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WithDestroyLifecycle } from '@store/types'
import { bytesToHex } from '@util/bytes'

const WA_APPSTATE_CLEAR_KEY = 'appstate:clear'

export function withAppStateLock(store: WaAppStateStore): WithDestroyLifecycle<WaAppStateStore> {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        exportData: () => gate.runShared(() => store.exportData()),
        upsertSyncKeys: (keys) =>
            gate.runShared(() =>
                lock.runMany(
                    keys.map((key) => `appstate:syncKey:${bytesToHex(key.keyId)}`),
                    () => store.upsertSyncKeys(keys)
                )
            ),
        getSyncKey: (keyId) => gate.runShared(() => store.getSyncKey(keyId)),
        getSyncKeyData: (keyId) => gate.runShared(() => store.getSyncKeyData(keyId)),
        getSyncKeyDataBatch: (keyIds) => gate.runShared(() => store.getSyncKeyDataBatch(keyIds)),
        getActiveSyncKey: () => gate.runShared(() => store.getActiveSyncKey()),
        getCollectionState: (collection) =>
            gate.runShared(() => store.getCollectionState(collection)),
        getCollectionStates: (collections) =>
            gate.runShared(() => store.getCollectionStates(collections)),
        setCollectionStates: (updates) =>
            gate.runShared(() =>
                lock.runMany(
                    updates.map((update) => `appstate:collection:${update.collection}`),
                    () => store.setCollectionStates(updates)
                )
            ),
        clear: () => gate.runExclusive(() => lock.run(WA_APPSTATE_CLEAR_KEY, () => store.clear())),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
