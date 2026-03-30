import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaSignalStore as WaSignalStoreContract } from '@store/contracts/signal.store'

export class WaSignalMemoryStore implements WaSignalStoreContract {
    private registrationInfo: RegistrationInfo | null
    private signedPreKey: SignedPreKeyRecord | null
    private signedPreKeyRotationTs: number | null

    public constructor() {
        this.registrationInfo = null
        this.signedPreKey = null
        this.signedPreKeyRotationTs = null
    }

    public async getRegistrationInfo(): Promise<RegistrationInfo | null> {
        return this.registrationInfo
    }

    public async setRegistrationInfo(info: RegistrationInfo): Promise<void> {
        this.registrationInfo = info
    }

    public async getSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        return this.signedPreKey
    }

    public async setSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
        this.signedPreKey = record
    }

    public async getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null> {
        if (!this.signedPreKey) {
            return null
        }
        return this.signedPreKey.keyId === keyId ? this.signedPreKey : null
    }

    public async setSignedPreKeyRotationTs(value: number | null): Promise<void> {
        this.signedPreKeyRotationTs = value
    }

    public async getSignedPreKeyRotationTs(): Promise<number | null> {
        return this.signedPreKeyRotationTs
    }

    public async clear(): Promise<void> {
        this.registrationInfo = null
        this.signedPreKey = null
        this.signedPreKeyRotationTs = null
    }
}
