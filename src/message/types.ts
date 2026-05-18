import type { Readable } from 'node:stream'

import type { WaSendContextInfo } from '@message/context-info'
import type { WaLinkPreviewOverride } from '@message/link-preview/types'
import type { Proto } from '@proto'
import type { WaOutboundReceiptType } from '@protocol/message'
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
    readonly upload?: WaMessageUploadInfo
}

export interface WaMessageUploadInfo {
    readonly url: string
    readonly directPath: string
    readonly fileSha256: Uint8Array
    readonly fileLength: number
    readonly metadataUrl?: string
}

export interface WaMessageBuildResult {
    readonly message: Proto.IMessage
    readonly upload?: WaMessageUploadInfo
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
    | 'contextInfo'

type UserMediaFields<T> = {
    readonly [K in keyof Omit<T, MediaFieldsFilledByBuilder>]?: T[K]
}

interface WaSendMediaBase {
    readonly media: MediaInput
    readonly mimetype: string
    readonly fileLength?: number
    readonly contextInfo?: WaSendContextInfo
}

interface WaSendMediaBaseOptionalMime {
    readonly media: MediaInput
    readonly mimetype?: string
    readonly fileLength?: number
    readonly contextInfo?: WaSendContextInfo
}

export interface WaSendTextMessage {
    readonly type: 'text'
    readonly text: string
    readonly contextInfo?: WaSendContextInfo
    /**
     * Link preview control: `undefined` follows the global `linkPreview.enabled`
     * default; `false` disables; `true` forces auto-fetch; an object skips the
     * fetch and uses the provided fields directly.
     */
    readonly linkPreview?: boolean | WaLinkPreviewOverride
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

export interface WaSendStickerPackStickerInput {
    readonly media: Uint8Array | string
    readonly fileName: string
    readonly emojis: readonly string[]
    readonly isAnimated?: boolean
    readonly isLottie?: boolean
    readonly mimetype?: string
}

export interface WaSendStickerPackTrayIcon {
    readonly media: Uint8Array | string
    readonly fileName: string
}

type StickerPackBuilderFilled =
    | 'stickers'
    | 'trayIconFileName'
    | 'thumbnailDirectPath'
    | 'thumbnailSha256'
    | 'thumbnailEncSha256'
    | 'stickerPackSize'
    | 'imageDataHash'
    | 'stickerPackOrigin'

export interface WaSendStickerPackMessage extends UserMediaFields<
    Omit<
        Proto.Message.IStickerPackMessage,
        StickerPackBuilderFilled | 'stickerPackId' | 'name' | 'publisher'
    >
> {
    readonly type: 'sticker-pack'
    readonly stickerPackId: string
    readonly name: string
    readonly publisher: string
    readonly stickers: readonly WaSendStickerPackStickerInput[]
    readonly trayIcon: WaSendStickerPackTrayIcon
    readonly coverThumbnail?: Uint8Array | string
    readonly contextInfo?: WaSendContextInfo
}

export type WaSendMediaMessage =
    | WaSendImageMessage
    | WaSendVideoMessage
    | WaSendPtvMessage
    | WaSendAudioMessage
    | WaSendDocumentMessage
    | WaSendStickerMessage
    | WaSendStickerPackMessage

export type WaSendMessageContent = string | WaSendTextMessage | Proto.IMessage | WaSendMediaMessage

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
    readonly type?: WaOutboundReceiptType
    readonly participant?: string
    readonly recipient?: string
    readonly category?: string
    readonly from?: string
    readonly t?: string
    readonly peerParticipantPn?: string
    readonly listIds?: readonly string[]
    readonly content?: readonly BinaryNode[]
}

export type WaSendReceiptOptions = Omit<WaSendReceiptInput, 'to' | 'id' | 'listIds'>

export type WaSendReceiptEventOptions = Omit<WaSendReceiptOptions, 'participant'>
