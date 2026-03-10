import type { WaAuthClientOptions, WaAuthCredentials, WaAuthSocketOptions } from '../auth/types'
import type { BinaryNode } from '../transport/types'

export interface WaClientOptions extends WaAuthClientOptions, WaAuthSocketOptions {}

export interface WaClientEventMap {
    readonly qr: (qr: string, ttlMs: number) => void
    readonly pairing_code: (code: string) => void
    readonly pairing_refresh: (forceManual: boolean) => void
    readonly paired: (credentials: WaAuthCredentials) => void
    readonly success: (node: BinaryNode) => void
    readonly error: (error: Error) => void
    readonly connected: () => void
    readonly disconnected: () => void
    readonly frame_in: (frame: Uint8Array) => void
    readonly frame_out: (frame: Uint8Array) => void
    readonly node_in: (node: BinaryNode, frame: Uint8Array) => void
    readonly node_out: (node: BinaryNode, frame: Uint8Array) => void
    readonly decode_error: (error: Error, frame: Uint8Array) => void
}
