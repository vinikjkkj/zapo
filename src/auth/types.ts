import type { SignalKeyPair } from '@crypto/curves/types'
import type { Proto } from '@proto'
import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaCommsConfig, WaProxyTransport } from '@transport/types'

export interface WaAuthCredentials {
    readonly noiseKeyPair: SignalKeyPair
    readonly registrationInfo: RegistrationInfo
    readonly signedPreKey: SignedPreKeyRecord
    readonly advSecretKey: Uint8Array
    readonly signedIdentity?: Proto.IADVSignedDeviceIdentity
    readonly meJid?: string
    readonly meLid?: string
    readonly meDisplayName?: string
    readonly companionEncStatic?: Uint8Array
    readonly platform?: string
    readonly serverStaticKey?: Uint8Array
    readonly serverHasPreKeys?: boolean
    readonly routingInfo?: Uint8Array
    readonly lastSuccessTs?: number
    readonly propsVersion?: number
    readonly abPropsVersion?: number
    readonly connectionLocation?: string
    readonly accountCreationTs?: number
}

export type WaAuthSocketOptions = Pick<
    WaCommsConfig,
    | 'url'
    | 'urls'
    | 'protocols'
    | 'connectTimeoutMs'
    | 'reconnectIntervalMs'
    | 'timeoutIntervalMs'
    | 'maxReconnectAttempts'
> & {
    readonly proxy?: {
        readonly ws?: WaProxyTransport
    }
}

export interface WaAuthClientOptions {
    readonly deviceBrowser?: string
    readonly devicePlatform?: string
    readonly deviceOsDisplayName?: string
    readonly requireFullSync?: boolean
    readonly version?: string
}

export interface WaSuccessPersistAttributes {
    readonly meLid?: string
    readonly meDisplayName?: string
    readonly companionEncStatic?: Uint8Array
    readonly lastSuccessTs?: number
    readonly propsVersion?: number
    readonly abPropsVersion?: number
    readonly connectionLocation?: string
    readonly accountCreationTs?: number
}
