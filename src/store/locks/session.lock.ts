import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WithDestroyLifecycle } from '@store/types'

export function withSessionLock(store: WaSessionStore): WithDestroyLifecycle<WaSessionStore> {
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        hasSession: (address) => gate.runShared(() => store.hasSession(address)),
        hasSessions: (addresses) => gate.runShared(() => store.hasSessions(addresses)),
        getSession: (address) => gate.runShared(() => store.getSession(address)),
        getSessionsBatch: (addresses) => gate.runShared(() => store.getSessionsBatch(addresses)),
        setSession: (address, session) => gate.runShared(() => store.setSession(address, session)),
        setSessionsBatch: (entries) => gate.runShared(() => store.setSessionsBatch(entries)),
        deleteSession: (address) => gate.runShared(() => store.deleteSession(address)),
        clear: () => gate.runExclusive(() => store.clear()),
        destroy: async () => {
            await gate.close()
            await destroyStore.destroy?.()
        }
    }
}
