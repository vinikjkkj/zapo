import type { BinaryNode } from '@transport/types'

export type WaRetryReceiptType = 'retry' | 'enc_rekey_retry'
export type WaRetryOutboundMode = 'plaintext' | 'encrypted' | 'opaque_node'
export type WaRetryOutboundState = 'pending' | 'delivered' | 'read' | 'played' | 'ineligible'

export interface WaRetryKey {
    readonly id: number
    readonly publicKey: Uint8Array
    readonly signature?: Uint8Array
}

export type WaRetrySignedKey = WaRetryKey & { readonly signature: Uint8Array }

export interface WaRetryKeyBundle {
    readonly identity: Uint8Array
    readonly deviceIdentity?: Uint8Array
    readonly key?: WaRetryKey
    readonly skey: WaRetryKey
}

export interface WaParsedRetryRequest {
    readonly type: WaRetryReceiptType
    readonly stanzaId: string
    readonly from: string
    readonly participant?: string
    readonly recipient?: string
    readonly offline: boolean
    readonly isLid: boolean
    readonly originalMsgId: string
    readonly retryCount: number
    readonly retryReason?: number
    readonly t?: string
    readonly regId: number
    readonly keyBundle?: WaRetryKeyBundle
}

export interface WaRetryDecryptFailureContext {
    readonly messageNode: BinaryNode
    readonly stanzaId: string
    readonly from: string
    readonly participant?: string
    readonly recipient?: string
    readonly t?: string
}

export interface WaRetryPlaintextReplayPayload {
    readonly mode: 'plaintext'
    readonly to: string
    readonly type: string
    readonly plaintext: Uint8Array
}

export interface WaRetryEncryptedReplayPayload {
    readonly mode: 'encrypted'
    readonly to: string
    readonly type: string
    readonly encType: 'msg' | 'pkmsg' | 'skmsg'
    readonly ciphertext: Uint8Array
    readonly participant?: string
}

export interface WaRetryOpaqueNodeReplayPayload {
    readonly mode: 'opaque_node'
    readonly node: Uint8Array
}

export type WaRetryReplayPayload =
    | WaRetryPlaintextReplayPayload
    | WaRetryEncryptedReplayPayload
    | WaRetryOpaqueNodeReplayPayload

export type WaRetryStoredReplayPayload = Uint8Array | WaRetryReplayPayload

export interface WaRetryOutboundMessageRecord {
    readonly messageId: string
    readonly toJid: string
    readonly participantJid?: string
    readonly recipientJid?: string
    readonly eligibleRequesterDeviceJids?: readonly string[]
    readonly deliveredRequesterDeviceJids?: readonly string[]
    readonly messageType: string
    readonly replayMode: WaRetryOutboundMode
    readonly replayPayload: WaRetryStoredReplayPayload
    readonly state: WaRetryOutboundState
    readonly createdAtMs: number
    readonly updatedAtMs: number
    readonly expiresAtMs: number
}
