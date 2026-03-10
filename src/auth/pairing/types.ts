import type { SignalKeyPair } from '../../crypto/curves/types'
import type { Logger } from '../../infra/log/types'
import type { WaAdvSignature } from '../../signal/crypto/WaAdvSignature'
import type { WaAuthTransportPort } from '../client.types'
import type { WaAuthCredentials, WaPairingCodeSession } from '../types'

import type { WaPairingCodeCrypto } from './WaPairingCodeCrypto'

export interface WaCompanionHelloState {
    readonly pairingCode: string
    readonly companionEphemeralKeyPair: SignalKeyPair
    readonly wrappedCompanionEphemeralPub: Uint8Array
}

export interface WaCompanionFinishResult {
    readonly wrappedKeyBundle: Uint8Array
    readonly companionIdentityPublic: Uint8Array
    readonly advSecret: Uint8Array
}

export interface ActivePairingSession extends WaPairingCodeSession {
    readonly companionEphemeralKeyPair: SignalKeyPair
    readonly phoneJid: string
    readonly pairingCode: string
    attempts: number
    finished: boolean
}

export interface WaPairingAuthPort {
    readonly getCredentials: () => WaAuthCredentials | null
    readonly updateCredentials: (credentials: WaAuthCredentials) => Promise<void>
    readonly getDevicePlatform: () => string
}

export interface WaPairingQrPort {
    readonly setRefs: (refs: readonly string[]) => void
    readonly clear: () => void
    readonly refresh: () => void
}

export interface WaPairingFlowCallbacks {
    readonly emitPairingCode: (code: string) => void
    readonly emitPairingRefresh: (forceManual: boolean) => void
    readonly emitPaired: (credentials: WaAuthCredentials) => void
}

export interface WaPairingFlowOptions {
    readonly logger: Logger
    readonly pairingCrypto: WaPairingCodeCrypto
    readonly advSignature: WaAdvSignature
    readonly auth: WaPairingAuthPort
    readonly socket: WaAuthTransportPort
    readonly qr: WaPairingQrPort
    readonly callbacks: WaPairingFlowCallbacks
}

export interface WaPairingSuccessHandlerOptions {
    readonly logger: Logger
    readonly advSignature: WaAdvSignature
    readonly auth: Pick<WaPairingAuthPort, 'getCredentials' | 'updateCredentials'>
    readonly socket: Pick<WaAuthTransportPort, 'sendNode'>
    readonly qr: Pick<WaPairingQrPort, 'clear'>
    readonly emitPaired: (credentials: WaAuthCredentials) => void
}
