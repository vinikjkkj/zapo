import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'

const WA_DEVICE_LIST_CLEAR_KEY = 'deviceList:clear'
const WA_DEVICE_LIST_CLEANUP_KEY = 'deviceList:cleanup'

export function withDeviceListLock(store: WaDeviceListStore): WaDeviceListStore {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    return {
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await store.destroy?.()
        },
        upsertUserDevicesBatch: (snapshots) =>
            gate.runShared(() =>
                lock.runMany(
                    snapshots.map((snapshot) => `deviceList:user:${snapshot.userJid}`),
                    () => store.upsertUserDevicesBatch(snapshots)
                )
            ),
        getUserDevicesBatch: (userJids, nowMs) =>
            gate.runShared(() => store.getUserDevicesBatch(userJids, nowMs)),
        deleteUserDevices: (userJid) =>
            gate.runShared(() =>
                lock.run(`deviceList:user:${userJid}`, () => store.deleteUserDevices(userJid))
            ),
        cleanupExpired: (nowMs) =>
            gate.runExclusive(() =>
                lock.run(WA_DEVICE_LIST_CLEANUP_KEY, () => store.cleanupExpired(nowMs))
            ),
        clear: () =>
            gate.runExclusive(() => lock.run(WA_DEVICE_LIST_CLEAR_KEY, () => store.clear()))
    }
}
