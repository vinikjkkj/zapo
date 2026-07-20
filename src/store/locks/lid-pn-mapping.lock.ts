import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import type { WaLidPnMappingStore } from '@store/contracts/lid-pn-mapping.store'
import type { WithDestroyLifecycle } from '@store/types'

export function withLidPnMappingLock(
    store: WaLidPnMappingStore
): WithDestroyLifecycle<WaLidPnMappingStore> {
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        getLidUser: (pnUser) => gate.runShared(() => store.getLidUser(pnUser)),
        getPnUser: (lidUser) => gate.runShared(() => store.getPnUser(lidUser)),
        // Replacing either side can evict a third-party pair, so every mapping write
        // shares one exclusive boundary. Writes are rare; reads stay concurrent.
        setLidUser: (pnUser, lidUser) => gate.runExclusive(() => store.setLidUser(pnUser, lidUser)),
        clear: () => gate.runExclusive(() => store.clear()),
        destroy: async () => {
            await gate.close()
            await destroyStore.destroy?.()
        }
    }
}
