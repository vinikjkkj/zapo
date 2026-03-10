import type { MediaKind } from '../media/types'
import type { Proto } from '../proto'
import type { BinaryNode } from '../transport/types'

export interface WaMessagePublishOptions {
    readonly ackTimeoutMs?: number
    readonly maxAttempts?: number
    readonly retryDelayMs?: number
}

export interface WaMessagePublishResult {
    readonly id: string
    readonly attempts: number
    readonly ackNode: BinaryNode
}

export interface WaSendMediaMessage {
    readonly type: MediaKind
    readonly media: Uint8Array | ArrayBuffer
    readonly mimetype: string
    readonly caption?: string
    readonly fileName?: string
    readonly ptt?: boolean
    readonly gifPlayback?: boolean
    readonly seconds?: number
    readonly width?: number
    readonly height?: number
}

export type WaSendMessageContent = string | Proto.IMessage | WaSendMediaMessage

export interface WaEncryptedMessageInput {
    readonly to: string
    readonly encType: 'msg' | 'pkmsg' | 'skmsg'
    readonly ciphertext: Uint8Array
    readonly id?: string
    readonly type?: string
    readonly participant?: string
    readonly deviceFanout?: string
}

export interface WaSendReceiptInput {
    readonly to: string
    readonly id: string
    readonly type?: string
    readonly participant?: string
    readonly from?: string
    readonly t?: string
}
