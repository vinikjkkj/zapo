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

type MediaInput = Uint8Array | ArrayBuffer | Readable | string

type MediaFieldsFilledByBuilder =
    | 'url'
    | 'mimetype'
    | 'fileSha256'
    | 'fileLength'
    | 'mediaKey'
    | 'fileEncSha256'
    | 'directPath'
    | 'mediaKeyTimestamp'
    | 'streamingSidecar'
    | 'metadataUrl'

type UserMediaFields<T> = {
    readonly [K in keyof Omit<T, MediaFieldsFilledByBuilder>]?: T[K]
}

interface WaSendMediaBase {
    readonly media: MediaInput
    readonly mimetype: string
    readonly fileLength?: number
}

interface WaSendMediaBaseOptionalMime {
    readonly media: MediaInput
    readonly mimetype?: string
    readonly fileLength?: number
}

interface WaSendImageMessage extends WaSendMediaBase, UserMediaFields<Proto.Message.IImageMessage> {
    readonly type: 'image'
}

interface WaSendVideoMessage extends WaSendMediaBase, UserMediaFields<Proto.Message.IVideoMessage> {
    readonly type: 'video'
}

interface WaSendPtvMessage extends WaSendMediaBase, UserMediaFields<Proto.Message.IVideoMessage> {
    readonly type: 'ptv'
}

interface WaSendAudioMessage extends WaSendMediaBase, UserMediaFields<Proto.Message.IAudioMessage> {
    readonly type: 'audio'
}

interface WaSendDocumentMessage
    extends WaSendMediaBase, UserMediaFields<Proto.Message.IDocumentMessage> {
    readonly type: 'document'
}

interface WaSendStickerMessage
    extends WaSendMediaBaseOptionalMime, UserMediaFields<Proto.Message.IStickerMessage> {
    readonly type: 'sticker'
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
