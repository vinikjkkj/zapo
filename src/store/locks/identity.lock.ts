import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import type { WithDestroyLifecycle } from '@store/types'

export function withIdentityLock(store: WaIdentityStore): WithDestroyLifecycle<WaIdentityStore> {
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        getRemoteIdentity: (address) => gate.runShared(() => store.getRemoteIdentity(address)),
        getRemoteIdentities: (addresses) =>
            gate.runShared(() => store.getRemoteIdentities(addresses)),
        setRemoteIdentity: (address, identityKey) =>
            gate.runShared(() => store.setRemoteIdentity(address, identityKey)),
        setRemoteIdentities: (entries) => gate.runShared(() => store.setRemoteIdentities(entries)),
        clear: () => gate.runExclusive(() => store.clear()),
        destroy: async () => {
            await gate.close()
            await destroyStore.destroy?.()
        }
    }
}
