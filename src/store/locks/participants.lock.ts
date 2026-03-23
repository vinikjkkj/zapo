import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaParticipantsStore } from '@store/contracts/participants.store'

const WA_PARTICIPANTS_CLEAR_KEY = 'participants:clear'
const WA_PARTICIPANTS_CLEANUP_KEY = 'participants:cleanup'

export function withParticipantsLock(store: WaParticipantsStore): WaParticipantsStore {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    return {
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await store.destroy?.()
        },
        upsertGroupParticipants: (snapshot) =>
            gate.runShared(() =>
                lock.run(`participants:group:${snapshot.groupJid}`, () =>
                    store.upsertGroupParticipants(snapshot)
                )
            ),
        getGroupParticipants: (groupJid, nowMs) =>
            gate.runShared(() => store.getGroupParticipants(groupJid, nowMs)),
        deleteGroupParticipants: (groupJid) =>
            gate.runShared(() =>
                lock.run(`participants:group:${groupJid}`, () =>
                    store.deleteGroupParticipants(groupJid)
                )
            ),
        cleanupExpired: (nowMs) =>
            gate.runExclusive(() =>
                lock.run(WA_PARTICIPANTS_CLEANUP_KEY, () => store.cleanupExpired(nowMs))
            ),
        clear: () =>
            gate.runExclusive(() => lock.run(WA_PARTICIPANTS_CLEAR_KEY, () => store.clear()))
    }
}
