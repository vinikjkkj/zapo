import { StoreLock } from '@infra/perf/StoreLock'
import type { WaAuthStore } from '@store/contracts/auth.store'

const WA_AUTH_KEY = 'credentials'

type WaAuthStoreWithLockLifecycle = WaAuthStore & {
    readonly destroy?: () => Promise<void>
}

export function withAuthLock(store: WaAuthStore): WaAuthStoreWithLockLifecycle {
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
