import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaPrivacyTokenStore } from '@store/contracts/privacy-token.store'

export function withPrivacyTokenLock(store: WaPrivacyTokenStore): WaPrivacyTokenStore {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    return {
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await store.destroy?.()
        },
        upsert: (record) =>
            gate.runShared(() => lock.run(`pt:${record.jid}`, () => store.upsert(record))),
        upsertBatch: (records) => gate.runExclusive(() => store.upsertBatch(records)),
        getByJid: (jid) => gate.runShared(() => store.getByJid(jid)),
        deleteByJid: (jid) =>
            gate.runShared(() => lock.run(`pt:${jid}`, () => store.deleteByJid(jid))),
        clear: () => gate.runExclusive(() => store.clear())
    }
}
