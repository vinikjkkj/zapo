import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaGroupMetadataStore } from '@store/contracts/group-metadata.store'

const WA_GROUP_METADATA_CLEAR_KEY = 'group-metadata:clear'
const WA_GROUP_METADATA_CLEANUP_KEY = 'group-metadata:cleanup'

export function withGroupMetadataLock(store: WaGroupMetadataStore): WaGroupMetadataStore {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    return {
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await store.destroy?.()
        },
        upsertGroupMetadata: (snapshot) =>
            gate.runShared(() =>
                lock.run(`group-metadata:group:${snapshot.groupJid}`, () =>
                    store.upsertGroupMetadata(snapshot)
                )
            ),
        getGroupMetadata: (groupJid, nowMs) =>
            gate.runShared(() => store.getGroupMetadata(groupJid, nowMs)),
        deleteGroupMetadata: (groupJid) =>
            gate.runShared(() =>
                lock.run(`group-metadata:group:${groupJid}`, () =>
                    store.deleteGroupMetadata(groupJid)
                )
            ),
        cleanupExpired: (nowMs) =>
            gate.runExclusive(() =>
                lock.run(WA_GROUP_METADATA_CLEANUP_KEY, () => store.cleanupExpired(nowMs))
            ),
        clear: () =>
            gate.runExclusive(() => lock.run(WA_GROUP_METADATA_CLEAR_KEY, () => store.clear()))
    }
}
