import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WithDestroyLifecycle } from '@store/types'

export function withMessageSecretLock(
    store: WaMessageSecretStore
): WithDestroyLifecycle<WaMessageSecretStore> {
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        get: (messageId, nowMs) => gate.runShared(() => store.get(messageId, nowMs)),
        getBatch: (messageIds, nowMs) => gate.runShared(() => store.getBatch(messageIds, nowMs)),
        set: (messageId, entry) => gate.runShared(() => store.set(messageId, entry)),
        setBatch: (entries) => gate.runShared(() => store.setBatch(entries)),
        cleanupExpired: (nowMs) => gate.runExclusive(() => store.cleanupExpired(nowMs)),
        clear: () => gate.runExclusive(() => store.clear()),
        destroy: async () => {
            await gate.close()
            await destroyStore.destroy?.()
        }
    }
}
