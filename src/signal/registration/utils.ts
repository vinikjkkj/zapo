import {
    generatePreKeyPair,
    generateRegistrationInfo,
    generateSignedPreKey
} from '@signal/registration/keygen'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaSignalStore } from '@store/contracts/signal.store'

interface RegistrationBundle {
    readonly registrationInfo: RegistrationInfo
    readonly signedPreKey: SignedPreKeyRecord
    readonly firstPreKey: PreKeyRecord
}

/**
 * Bootstraps a fresh Signal identity: generates registration info, the first
 * signed prekey, and the first one-time prekey, then persists them in order
 * so a partial commit can never split bootstrap state.
 */
export async function createAndStoreInitialKeys(
    store: WaSignalStore,
    preKeyStore: WaPreKeyStore
): Promise<RegistrationBundle> {
    const [registrationInfo, firstPreKey] = await Promise.all([
        generateRegistrationInfo(),
        generatePreKeyPair(1)
    ])
    const signedPreKey = await generateSignedPreKey(1, registrationInfo.identityKeyPair.privKey)

    // Keep writes ordered so partial commit failures don't leave split registration bootstrap state.
    await store.setRegistrationInfo(registrationInfo)
    await store.setSignedPreKey(signedPreKey)
    // putPreKey (idempotent), not getOrGenSinglePreKey: a fixed-keyId generator
    // collides with a stale keyId 1 and would spin forever inside getOrGen*.
    await preKeyStore.putPreKey(firstPreKey)

    return {
        registrationInfo,
        signedPreKey,
        firstPreKey
    }
}
