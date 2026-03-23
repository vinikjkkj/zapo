import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WithDestroyLifecycle } from '@store/types'

const WA_MESSAGE_CLEAR_KEY = 'message:clear'

export function withMessageLock(store: WaMessageStore): WithDestroyLifecycle<WaMessageStore> {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        upsert: (record) =>
            gate.runShared(() => lock.run(`message:${record.id}`, () => store.upsert(record))),
        upsertBatch: (records) =>
            gate.runShared(() =>
                lock.runMany(
                    records.map((record) => `message:${record.id}`),
                    () => store.upsertBatch(records)
                )
            ),
        getById: (id) => gate.runShared(() => store.getById(id)),
        listByThread: (threadJid, limit, beforeTimestampMs) =>
            gate.runShared(() => store.listByThread(threadJid, limit, beforeTimestampMs)),
        deleteById: (id) =>
            gate.runShared(() => lock.run(`message:${id}`, () => store.deleteById(id))),
        clear: () => gate.runExclusive(() => lock.run(WA_MESSAGE_CLEAR_KEY, () => store.clear())),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
