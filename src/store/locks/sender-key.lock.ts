import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import { signalAddressKey } from '@protocol/jid'
import type { SignalAddress } from '@signal/types'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'

const WA_SENDER_KEY_CLEAR_KEY = 'senderKey:clear'

function senderKeyLockKey(groupId: string, sender: SignalAddress): string {
    return `senderKey:${groupId}:${signalAddressKey(sender)}`
}

function senderDistributionLockKey(groupId: string, sender: SignalAddress): string {
    return `senderKeyDistribution:${groupId}:${signalAddressKey(sender)}`
}

function senderAnyLockKey(sender: SignalAddress): string {
    return `senderKey:any:${signalAddressKey(sender)}`
}

type WaSenderKeyStoreWithLockLifecycle = WaSenderKeyStore & {
    readonly destroy?: () => Promise<void>
}

export function withSenderKeyLock(store: WaSenderKeyStore): WaSenderKeyStoreWithLockLifecycle {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        upsertSenderKey: (record) =>
            gate.runShared(() =>
                lock.runMany(
                    [
                        senderAnyLockKey(record.sender),
                        senderKeyLockKey(record.groupId, record.sender)
                    ],
                    () => store.upsertSenderKey(record)
                )
            ),
        upsertSenderKeyDistribution: (record) =>
            gate.runShared(() =>
                lock.runMany(
                    [
                        senderAnyLockKey(record.sender),
                        senderDistributionLockKey(record.groupId, record.sender)
                    ],
                    () => store.upsertSenderKeyDistribution(record)
                )
            ),
        upsertSenderKeyDistributions: (records) =>
            gate.runShared(() =>
                lock.runMany(
                    records.flatMap((record) => [
                        senderAnyLockKey(record.sender),
                        senderDistributionLockKey(record.groupId, record.sender)
                    ]),
                    () => store.upsertSenderKeyDistributions(records)
                )
            ),
        getGroupSenderKeyList: (groupId) =>
            gate.runShared(() => store.getGroupSenderKeyList(groupId)),
        getDeviceSenderKey: (groupId, sender) =>
            gate.runShared(() => store.getDeviceSenderKey(groupId, sender)),
        getDeviceSenderKeyDistributions: (groupId, senders) =>
            gate.runShared(() => store.getDeviceSenderKeyDistributions(groupId, senders)),
        deleteDeviceSenderKey: (target, groupId) =>
            gate.runShared(() =>
                lock.runMany(
                    groupId
                        ? [
                              senderAnyLockKey(target),
                              senderKeyLockKey(groupId, target),
                              senderDistributionLockKey(groupId, target)
                          ]
                        : [senderAnyLockKey(target)],
                    () => store.deleteDeviceSenderKey(target, groupId)
                )
            ),
        markForgetSenderKey: (groupId, participants) =>
            gate.runShared(() =>
                lock.runMany(
                    participants.flatMap((participant) => [
                        senderAnyLockKey(participant),
                        senderKeyLockKey(groupId, participant)
                    ]),
                    () => store.markForgetSenderKey(groupId, participants)
                )
            ),
        clear: () =>
            gate.runExclusive(() => lock.run(WA_SENDER_KEY_CLEAR_KEY, () => store.clear())),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
