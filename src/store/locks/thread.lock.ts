import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaThreadStore } from '@store/contracts/thread.store'

const WA_THREAD_CLEAR_KEY = 'thread:clear'

type WaThreadStoreWithLockLifecycle = WaThreadStore & {
    readonly destroy?: () => Promise<void>
}

export function withThreadLock(store: WaThreadStore): WaThreadStoreWithLockLifecycle {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        upsert: (record) =>
            gate.runShared(() => lock.run(`thread:${record.jid}`, () => store.upsert(record))),
        upsertBatch: (records) =>
            gate.runShared(() =>
                lock.runMany(
                    records.map((record) => `thread:${record.jid}`),
                    () => store.upsertBatch(records)
                )
            ),
        getByJid: (jid) => gate.runShared(() => store.getByJid(jid)),
        list: (limit) => gate.runShared(() => store.list(limit)),
        deleteByJid: (jid) =>
            gate.runShared(() => lock.run(`thread:${jid}`, () => store.deleteByJid(jid))),
        clear: () => gate.runExclusive(() => lock.run(WA_THREAD_CLEAR_KEY, () => store.clear())),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
