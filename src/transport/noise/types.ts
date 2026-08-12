import type { Proto } from '@proto'
import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'

export interface WaPayloadCommonConfig {
    readonly passive?: boolean
    /**
     * Defaults to `true` for a login handshake and `false` for a registration
     * handshake, matching WhatsApp Web.
     */
    readonly pull?: boolean
    readonly versionBase?: string
    readonly deviceBrowser?: string
    readonly deviceOsDisplayName?: string
    /**
     * OS version advertised in `DeviceProps.version` (`'10'`, `'14.6'`, ...).
     * Defaults to the detected runtime OS version. Values that are not
     * dotted-numeric leave the field unset, as WhatsApp Web does.
     */
    readonly deviceOsVersion?: string
    readonly userAgent?: typeof Proto.ClientPayload.prototype.userAgent
    readonly webInfo?: typeof Proto.ClientPayload.prototype.webInfo
}

export interface WaLoginPayloadConfig extends WaPayloadCommonConfig {
    readonly username: number
    readonly device?: number
    readonly lidDbMigrated?: boolean
    /**
     * Successful logins since this device was paired, sent as `lc`. Reset to
     * `0` on the first connect after pairing.
     */
    readonly loginCounter?: number
    /** Successful connections made by this process, sent as `connectAttemptCount`. */
    readonly connectAttemptCount?: number
}

export interface WaRegistrationPayloadConfig extends WaPayloadCommonConfig {
    readonly registrationInfo: RegistrationInfo
    readonly signedPreKey: SignedPreKeyRecord
    readonly buildHash?: Uint8Array
    readonly deviceProps?: Uint8Array
    readonly requireFullSync?: boolean
}
