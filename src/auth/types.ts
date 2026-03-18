import type { SignalKeyPair } from '@crypto/curves/types'
import type { Proto } from '@proto'
import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaProxyTransport } from '@transport/types'

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

export interface WaAuthSocketOptions {
    readonly url?: string
    readonly urls?: readonly string[]
    readonly protocols?: readonly string[]
    readonly connectTimeoutMs?: number
    readonly reconnectIntervalMs?: number
    readonly timeoutIntervalMs?: number
    readonly maxReconnectAttempts?: number
    readonly proxy?: {
        readonly ws?: WaProxyTransport
    }
}

export interface WaAuthClientOptions {
    readonly deviceBrowser?: string
    readonly devicePlatform?: string
    readonly deviceOsDisplayName?: string
    readonly requireFullSync?: boolean
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
