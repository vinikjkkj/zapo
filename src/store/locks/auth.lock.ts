import { StoreLock } from '@infra/perf/StoreLock'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WithDestroyLifecycle } from '@store/types'

const WA_AUTH_KEY = 'credentials'

export function withAuthLock(store: WaAuthStore): WithDestroyLifecycle<WaAuthStore> {
    const lock = new StoreLock()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        load: () => lock.run(WA_AUTH_KEY, () => store.load()),
        save: (credentials) => lock.run(WA_AUTH_KEY, () => store.save(credentials)),
        clear: () => lock.run(WA_AUTH_KEY, () => store.clear()),
        destroy: async () => {
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
