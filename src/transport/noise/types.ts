import type { Proto } from '../../proto'
import type { RegistrationInfo, SignedPreKeyRecord } from '../../signal/types'

export interface WaPayloadCommonConfig {
    readonly passive?: boolean
    readonly pull?: boolean
    readonly versionBase?: string
    readonly userAgent?: typeof Proto.ClientPayload.prototype.userAgent
    readonly webInfo?: typeof Proto.ClientPayload.prototype.webInfo
}

export interface WaLoginPayloadConfig extends WaPayloadCommonConfig {
    readonly username: number
    readonly device?: number
    readonly lidDbMigrated?: boolean
}

export interface WaRegistrationPayloadConfig extends WaPayloadCommonConfig {
    readonly registrationInfo: RegistrationInfo
    readonly signedPreKey: SignedPreKeyRecord
    readonly buildHash?: Uint8Array
    readonly deviceProps?: Uint8Array
}
