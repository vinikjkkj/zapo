import type { Readable } from 'node:stream'

import type { Proto } from '@proto'
import type { BinaryNode } from '@transport/types'

export interface WaMessagePublishOptions {
    readonly ackTimeoutMs?: number
    readonly maxAttempts?: number
    readonly retryDelayMs?: number
}

export interface WaMessageAckMetadata {
    readonly t?: string
    readonly sync?: string
    readonly phash?: string
    readonly refreshLid: boolean
    readonly addressingMode?: 'pn' | 'lid'
    readonly count?: number
    readonly error?: number
}

export interface WaMessagePublishResult {
    readonly id: string
    readonly attempts: number
    readonly ackNode: BinaryNode
    readonly ack: WaMessageAckMetadata
}

type MediaInput = Uint8Array | ArrayBuffer | Readable

interface WaSendMediaBase {
    readonly media: MediaInput
    readonly mimetype: string
    readonly fileLength?: number
}

interface WaSendImageMessage extends WaSendMediaBase {
    readonly type: 'image'
    readonly caption?: string
    readonly width?: number
    readonly height?: number
}

interface WaSendVideoMessage extends WaSendMediaBase {
    readonly type: 'video'
    readonly caption?: string
    readonly gifPlayback?: boolean
    readonly seconds?: number
    readonly width?: number
    readonly height?: number
}

interface WaSendPtvMessage extends WaSendMediaBase {
    readonly type: 'ptv'
    readonly seconds?: number
    readonly width?: number
    readonly height?: number
}

interface WaSendAudioMessage extends WaSendMediaBase {
    readonly type: 'audio'
    readonly ptt?: boolean
    readonly seconds?: number
}

interface WaSendDocumentMessage extends WaSendMediaBase {
    readonly type: 'document'
    readonly caption?: string
    readonly fileName?: string
}

interface WaSendStickerMessage extends WaSendMediaBase {
    readonly type: 'sticker'
    readonly width?: number
    readonly height?: number
}

export type WaSendMediaMessage =
    | WaSendImageMessage
    | WaSendVideoMessage
    | WaSendPtvMessage
    | WaSendAudioMessage
    | WaSendDocumentMessage
    | WaSendStickerMessage

export type WaSendMessageContent = string | Proto.IMessage | WaSendMediaMessage

export interface WaEncryptedMessageInput {
    readonly to: string
    readonly encType: 'msg' | 'pkmsg' | 'skmsg'
    readonly ciphertext: Uint8Array
    readonly deviceIdentity?: Uint8Array
    readonly addressingMode?: 'pn' | 'lid'
    readonly encCount?: number
    readonly id?: string
    readonly type?: string
    readonly edit?: string
    readonly mediatype?: string
    readonly category?: string
    readonly pushPriority?: string
    readonly participant?: string
    readonly deviceFanout?: string
    readonly metaNode?: BinaryNode
}

export interface WaSendReceiptInput {
    readonly to: string
    readonly id: string
    readonly type?: string
    readonly participant?: string
    readonly recipient?: string
    readonly category?: string
    readonly from?: string
    readonly t?: string
    readonly peerParticipantPn?: string
    readonly listIds?: readonly string[]
    readonly content?: readonly BinaryNode[]
}
