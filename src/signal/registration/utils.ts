import {
    generatePreKeyPair,
    generateRegistrationInfo,
    generateSignedPreKey
} from '@signal/registration/keygen'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaSignalStore } from '@store/contracts/signal.store'

interface RegistrationBundle {
    readonly registrationInfo: RegistrationInfo
    readonly signedPreKey: SignedPreKeyRecord
    readonly firstPreKey: PreKeyRecord
}

export async function createAndStoreInitialKeys(store: WaSignalStore): Promise<RegistrationBundle> {
    const [registrationInfo, firstPreKey] = await Promise.all([
        generateRegistrationInfo(),
        generatePreKeyPair(1)
    ])
    const signedPreKey = await generateSignedPreKey(1, registrationInfo.identityKeyPair.privKey)

    // Keep writes ordered so partial commit failures don't leave split registration bootstrap state.
    await store.setRegistrationInfo(registrationInfo)
    await store.setSignedPreKey(signedPreKey)
    await store.getOrGenSinglePreKey(async () => firstPreKey)

    return {
        registrationInfo,
        signedPreKey,
        firstPreKey
    }
}
