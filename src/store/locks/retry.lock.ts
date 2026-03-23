import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaRetryStore } from '@store/contracts/retry.store'

const WA_RETRY_CLEANUP_KEY = 'retry:cleanup'
const WA_RETRY_CLEAR_KEY = 'retry:clear'

export function withRetryLock(store: WaRetryStore): WaRetryStore {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    return {
        getTtlMs: store.getTtlMs?.bind(store),
        supportsRawReplayPayload: store.supportsRawReplayPayload?.bind(store),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await store.destroy?.()
        },
        getOutboundRequesterStatus: (messageId, requesterDeviceJid) =>
            gate.runShared(() => store.getOutboundRequesterStatus(messageId, requesterDeviceJid)),
        upsertOutboundMessage: (record) =>
            gate.runShared(() =>
                lock.run(`retry:outbound:${record.messageId}`, () =>
                    store.upsertOutboundMessage(record)
                )
            ),
        deleteOutboundMessage: (messageId) =>
            gate.runShared(() =>
                lock.run(`retry:outbound:${messageId}`, () =>
                    store.deleteOutboundMessage(messageId)
                )
            ),
        getOutboundMessage: (messageId) =>
            gate.runShared(() => store.getOutboundMessage(messageId)),
        updateOutboundMessageState: (messageId, state, updatedAtMs, expiresAtMs) =>
            gate.runShared(() =>
                lock.run(`retry:outbound:${messageId}`, () =>
                    store.updateOutboundMessageState(messageId, state, updatedAtMs, expiresAtMs)
                )
            ),
        markOutboundRequesterDelivered: (messageId, requesterDeviceJid, updatedAtMs, expiresAtMs) =>
            gate.runShared(() =>
                lock.runMany(
                    [
                        `retry:outbound:${messageId}`,
                        `retry:outbound:${messageId}:${requesterDeviceJid}`
                    ],
                    () =>
                        store.markOutboundRequesterDelivered(
                            messageId,
                            requesterDeviceJid,
                            updatedAtMs,
                            expiresAtMs
                        )
                )
            ),
        incrementInboundCounter: (messageId, requesterJid, updatedAtMs, expiresAtMs) =>
            gate.runShared(() =>
                lock.run(`retry:inbound:${messageId}:${requesterJid}`, () =>
                    store.incrementInboundCounter(messageId, requesterJid, updatedAtMs, expiresAtMs)
                )
            ),
        cleanupExpired: (nowMs) =>
            gate.runExclusive(() =>
                lock.run(WA_RETRY_CLEANUP_KEY, () => store.cleanupExpired(nowMs))
            ),
        clear: () => gate.runExclusive(() => lock.run(WA_RETRY_CLEAR_KEY, () => store.clear()))
    }
}
