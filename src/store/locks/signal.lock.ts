import { SharedExclusiveGate } from '@infra/perf/SharedExclusiveGate'
import { StoreLock } from '@infra/perf/StoreLock'
import type { WaSignalStore } from '@store/contracts/signal.store'

const WA_SIGNAL_REGISTRATION_KEY = 'signal:registration'
const WA_SIGNAL_SIGNED_PREKEY_KEY = 'signal:signedPreKey'
const WA_SIGNAL_PREKEYS_KEY = 'signal:prekeys'
const WA_SIGNAL_SERVER_HAS_PREKEYS_KEY = 'signal:serverHasPreKeys'
const WA_SIGNAL_CLEAR_KEY = 'signal:clear'

type WaSignalStoreWithLockLifecycle = WaSignalStore & {
    readonly destroy?: () => Promise<void>
}

export function withSignalLock(store: WaSignalStore): WaSignalStoreWithLockLifecycle {
    const lock = new StoreLock()
    const gate = new SharedExclusiveGate()
    const destroyStore = store as { destroy?: () => Promise<void> }
    return {
        getRegistrationInfo: () => gate.runShared(() => store.getRegistrationInfo()),
        setRegistrationInfo: (info) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_REGISTRATION_KEY, () => store.setRegistrationInfo(info))
            ),
        getSignedPreKey: () => gate.runShared(() => store.getSignedPreKey()),
        setSignedPreKey: (record) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_SIGNED_PREKEY_KEY, () => store.setSignedPreKey(record))
            ),
        getSignedPreKeyById: (keyId) => gate.runShared(() => store.getSignedPreKeyById(keyId)),
        setSignedPreKeyRotationTs: (value) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_SIGNED_PREKEY_KEY, () => store.setSignedPreKeyRotationTs(value))
            ),
        getSignedPreKeyRotationTs: () => gate.runShared(() => store.getSignedPreKeyRotationTs()),
        putPreKey: (record) =>
            gate.runShared(() => lock.run(WA_SIGNAL_PREKEYS_KEY, () => store.putPreKey(record))),
        getOrGenPreKeys: (count, generator) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_PREKEYS_KEY, () => store.getOrGenPreKeys(count, generator))
            ),
        getPreKeyById: (keyId) => gate.runShared(() => store.getPreKeyById(keyId)),
        getPreKeysById: (keyIds) => gate.runShared(() => store.getPreKeysById(keyIds)),
        consumePreKeyById: (keyId) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_PREKEYS_KEY, () => store.consumePreKeyById(keyId))
            ),
        getOrGenSinglePreKey: (generator) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_PREKEYS_KEY, () => store.getOrGenSinglePreKey(generator))
            ),
        markKeyAsUploaded: (keyId) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_PREKEYS_KEY, () => store.markKeyAsUploaded(keyId))
            ),
        setServerHasPreKeys: (value) =>
            gate.runShared(() =>
                lock.run(WA_SIGNAL_SERVER_HAS_PREKEYS_KEY, () => store.setServerHasPreKeys(value))
            ),
        getServerHasPreKeys: () => gate.runShared(() => store.getServerHasPreKeys()),
        getSignalMeta: () => gate.runShared(() => store.getSignalMeta()),
        hasSession: (address) => gate.runShared(() => store.hasSession(address)),
        hasSessions: (addresses) => gate.runShared(() => store.hasSessions(addresses)),
        getSession: (address) => gate.runShared(() => store.getSession(address)),
        getSessionsBatch: (addresses) => gate.runShared(() => store.getSessionsBatch(addresses)),
        // Session and identity read-modify-write semantics are serialized in SignalProtocol per address.
        setSession: (address, session) => gate.runShared(() => store.setSession(address, session)),
        setSessionsBatch: (entries) => gate.runShared(() => store.setSessionsBatch(entries)),
        deleteSession: (address) => gate.runShared(() => store.deleteSession(address)),
        getRemoteIdentity: (address) => gate.runShared(() => store.getRemoteIdentity(address)),
        getRemoteIdentities: (addresses) =>
            gate.runShared(() => store.getRemoteIdentities(addresses)),
        setRemoteIdentity: (address, identityKey) =>
            gate.runShared(() => store.setRemoteIdentity(address, identityKey)),
        setRemoteIdentities: (entries) => gate.runShared(() => store.setRemoteIdentities(entries)),
        clear: () => gate.runExclusive(() => lock.run(WA_SIGNAL_CLEAR_KEY, () => store.clear())),
        destroy: async () => {
            await gate.close()
            await lock.shutdown()
            await destroyStore.destroy?.()
        }
    }
}
