import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'

export interface WaSignalStore {
    getRegistrationInfo(): Promise<RegistrationInfo | null>
    setRegistrationInfo(info: RegistrationInfo): Promise<void>
    getSignedPreKey(): Promise<SignedPreKeyRecord | null>
    setSignedPreKey(record: SignedPreKeyRecord): Promise<void>
    getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null>
    setSignedPreKeyRotationTs(value: number | null): Promise<void>
    getSignedPreKeyRotationTs(): Promise<number | null>
    clear(): Promise<void>
}
