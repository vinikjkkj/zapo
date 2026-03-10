import type { X25519 } from '../crypto/curves/X25519'
import type { Logger } from '../infra/log/types'
import type { WaAdvSignature } from '../signal/crypto/WaAdvSignature'
import type { WaSignalStore } from '../signal/store/WaSignalStore'
import type { BinaryNode } from '../transport/types'

import type { WaPairingCodeCrypto } from './pairing/WaPairingCodeCrypto'
import type { WaAuthCredentials } from './types'

export interface WaAuthSocketOptions {
    readonly url?: string
    readonly urls?: readonly string[]
    readonly protocols?: readonly string[]
    readonly connectTimeoutMs?: number
    readonly reconnectIntervalMs?: number
    readonly timeoutIntervalMs?: number
    readonly maxReconnectAttempts?: number
}

export interface WaAuthClientOptions {
    readonly authPath: string
    readonly devicePlatform?: string
}

export interface WaAuthClientCallbacks {
    readonly onQr?: (qr: string, ttlMs: number) => void
    readonly onPairingCode?: (code: string) => void
    readonly onPairingRefresh?: (forceManual: boolean) => void
    readonly onPaired?: (credentials: WaAuthCredentials) => void
    readonly onError?: (error: Error) => void
}

export interface WaAuthTransportPort {
    readonly sendNode: (node: BinaryNode) => Promise<void>
    readonly query: (node: BinaryNode, timeoutMs?: number) => Promise<BinaryNode>
}

export interface WaAuthClientDependencies {
    readonly logger: Logger
    readonly signalStore: WaSignalStore
    readonly x25519: X25519
    readonly pairingCrypto: WaPairingCodeCrypto
    readonly advSignature: WaAdvSignature
    readonly socket: WaAuthTransportPort
    readonly callbacks?: WaAuthClientCallbacks
}
