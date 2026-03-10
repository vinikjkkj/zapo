import type { WaSignalStore } from '../store/WaSignalStore'
import type { PreKeyRecord, RegistrationInfo, SignedPreKeyRecord } from '../types'

interface RegistrationBundle {
    readonly registrationInfo: RegistrationInfo
    readonly signedPreKey: SignedPreKeyRecord
    readonly firstPreKey: PreKeyRecord
}

interface RegistrationSignalKeyApi {
    readonly generateRegistrationInfo: () => Promise<RegistrationInfo>
    readonly generatePreKeyPair: (keyId: number) => Promise<PreKeyRecord>
    readonly generateSignedPreKey: (
        keyId: number,
        signingPrivateKey: Uint8Array
    ) => Promise<SignedPreKeyRecord>
}

export async function createAndStoreInitialKeys(
    store: WaSignalStore,
    signalKeyApi: RegistrationSignalKeyApi
): Promise<RegistrationBundle> {
    const registrationInfo = await signalKeyApi.generateRegistrationInfo()
    const signedPreKey = await signalKeyApi.generateSignedPreKey(
        1,
        registrationInfo.identityKeyPair.privKey
    )
    const firstPreKey = await signalKeyApi.generatePreKeyPair(1)

    await store.setRegistrationInfo(registrationInfo)
    await store.setSignedPreKey(signedPreKey)
    await store.getOrGenSinglePreKey(async () => firstPreKey)

    return {
        registrationInfo,
        signedPreKey,
        firstPreKey
    }
}
