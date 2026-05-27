import type { SignalKeyPair } from '@crypto/curves/types'
import type { Proto } from '@proto'
import type { RegistrationInfo, SignedPreKeyRecord } from '@signal/types'
import type { WaMobileTransportDeviceInfo } from '@transport/noise/WaMobileClientPayload'
import type { WaCommsConfig, WaProxyTransport } from '@transport/types'

export type { WaMobileTransportDeviceInfo } from '@transport/noise/WaMobileClientPayload'

/**
 * @sensitive Contains private key material (`noiseKeyPair`, `signedPreKey`,
 * `advSecretKey`, `serverStaticKey`, `companionEncStatic`). Never log, serialize
 * via `JSON.stringify`, or transmit unencrypted. Persist with encryption-at-rest.
 */
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
    readonly deviceInfo?: WaMobileTransportDeviceInfo
    readonly pushName?: string
    readonly yearClass?: number
    readonly memClass?: number
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
    /**
     * Browser id advertised during pairing (`'chrome' | 'firefox' | 'safari' |
     * ...`, see {@link WA_BROWSERS}). Drives the platform id sent in the
     * link-code stanza and the *Linked Devices* UI label on the phone.
     * Defaults to `WA_DEFAULTS.DEVICE_BROWSER` (`'chrome'`).
     */
    readonly deviceBrowser?: string
    /**
     * Override the numeric companion platform id (see
     * {@link WA_COMPANION_PLATFORM_IDS}). Inferred from `deviceBrowser` when
     * omitted – set explicitly for non-browser platforms (Electron, UWP, ...).
     */
    readonly devicePlatform?: string
    /**
     * Human-readable OS name shown in the *Linked Devices* list (`'Windows'`,
     * `'Mac OS'`, `'Linux'`). Defaults to the current runtime's OS.
     */
    readonly deviceOsDisplayName?: string
    /**
     * When `true`, request a full history download from the primary device on
     * pairing instead of just recent messages. Off by default.
     */
    readonly requireFullSync?: boolean
    /**
     * WhatsApp Web version string the client advertises (`'x.y.z'`). Defaults
     * to a tested production version – only override to pin/upgrade manually.
     */
    readonly version?: string
    /**
     * **Dangerous escape hatches** – each flag disables a security check.
     * Do not enable in production.
     */
    readonly dangerous?: WaAuthDangerousOptions
    /**
     * Mobile-transport overrides (TCP socket, device info). Set this to
     * connect via the WhatsApp Mobile protocol instead of Web – see
     * {@link WaMobileTransportOptions}.
     */
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
