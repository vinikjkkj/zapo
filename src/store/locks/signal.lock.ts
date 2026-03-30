import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { RegistrationInfo } from '@signal/types'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { WithDestroyLifecycle } from '@store/types'

const WA_SIGNAL_REGISTRATION_KEY = 'signal:registration'
const WA_SIGNAL_SIGNED_PREKEY_KEY = 'signal:signedPreKey'
const WA_SIGNAL_CLEAR_KEY = 'signal:clear'

export function withSignalLock(store: WaSignalStore): WithDestroyLifecycle<WaSignalStore> {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    let cachedRegInfo: RegistrationInfo | null | undefined
    return {
        getRegistrationInfo: () =>
            gate.runShared(async () => {
                if (cachedRegInfo !== undefined) {
                    return cachedRegInfo
                }
                const info = await store.getRegistrationInfo()
                cachedRegInfo = info
                return info
            }),
        setRegistrationInfo: (info) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_REGISTRATION_KEY, async () => {
                    await store.setRegistrationInfo(info)
                    cachedRegInfo = info
                })
            ),
        getSignedPreKey: () => gate.runShared(() => store.getSignedPreKey()),
        setSignedPreKey: (record) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_SIGNED_PREKEY_KEY, () => store.setSignedPreKey(record))
            ),
        getSignedPreKeyById: (keyId) => gate.runShared(() => store.getSignedPreKeyById(keyId)),
        setSignedPreKeyRotationTs: (value) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_SIGNED_PREKEY_KEY, () => store.setSignedPreKeyRotationTs(value))
            ),
        getSignedPreKeyRotationTs: () => gate.runShared(() => store.getSignedPreKeyRotationTs()),
        clear: () =>
            gate.runExclusive(() =>
                lock.run(WA_SIGNAL_CLEAR_KEY, async () => {
                    await store.clear()
                    cachedRegInfo = undefined
                })
            ),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
