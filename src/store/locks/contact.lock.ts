import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WithDestroyLifecycle } from '@store/types'

const WA_CONTACT_CLEAR_KEY = 'contact:clear'

export function withContactLock(store: WaContactStore): WithDestroyLifecycle<WaContactStore> {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        upsert: (record) =>
            gate.runShared(() => lock.run(`contact:${record.jid}`, () => store.upsert(record))),
        upsertBatch: (records) =>
            gate.runShared(() =>
                lock.runMany(
                    records.map((record) => `contact:${record.jid}`),
                    () => store.upsertBatch(records)
                )
            ),
        getByJid: (jid) => gate.runShared(() => store.getByJid(jid)),
        deleteByJid: (jid) =>
            gate.runShared(() => lock.run(`contact:${jid}`, () => store.deleteByJid(jid))),
        clear: () => gate.runExclusive(() => lock.run(WA_CONTACT_CLEAR_KEY, () => store.clear())),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
