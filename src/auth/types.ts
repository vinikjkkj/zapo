import type { SignalKeyPair } from '@crypto/curves/types'
import type { Proto } from '@proto'
import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaMobileTransportDeviceInfo } from '@transport/noise/WaMobileClientPayload'
import type { WaCommsConfig, WaProxyTransport } from '@transport/types'

export type { WaMobileTransportDeviceInfo } from '@transport/noise/WaMobileClientPayload'

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
    readonly dangerous?: WaAuthDangerousOptions
    readonly mobileTransport?: WaMobileTransportOptions
}

export interface WaMobileTransportOptions {
    readonly deviceInfo: WaMobileTransportDeviceInfo
    readonly tcpUrl?: string
    readonly passive?: boolean
    readonly pushName?: string
    readonly yearClass?: number
    readonly memClass?: number
}

export interface WaAuthDangerousOptions {
    /**
     * Skip the noise certificate-chain verification during the handshake.
     * The server's static key will be accepted without proof that it was
     * issued by a trusted root.
     */
    readonly disableNoiseCertificateChainVerification?: boolean
    /**
     * Skip the XEdDSA account-signature check on the `pair-success` ADV
     * identity payload, which normally proves the primary device signed off
     * on this companion.
     */
    readonly disableAdvSignatureVerification?: boolean
    /**
     * Skip the HMAC check on the `pair-success` stanza that ties the ADV
     * payload to the shared pairing secret.
     */
    readonly disablePairSuccessHmacVerification?: boolean
    /**
     * Skip the XEdDSA signature check on the locally stored signed pre-key
     * during credential load. Corrupt or forged credentials will be accepted.
     */
    readonly disableSignedPreKeySignatureVerification?: boolean
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
