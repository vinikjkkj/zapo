import type { Readable } from 'node:stream'

import type { WaLinkPreviewOverride } from '@message/addons/link-preview/types'
import type { WaSendContextInfo } from '@message/context-info'
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

export interface WaSendMessageTarget {
    readonly stanzaId: string
    readonly fromMe: boolean
    /** Required in groups when targeting a message sent by another participant. */
    readonly participant?: string
}

/** @deprecated use {@link WaSendMessageTarget} */
export type WaSendReactionTarget = WaSendMessageTarget

export interface WaSendReactionMessage {
    readonly type: 'reaction'
    /** Emoji to attach. Pass an empty string to revoke an existing reaction. */
    readonly emoji: string
    readonly target: WaSendMessageTarget
    /** Defaults to `Date.now()` when omitted. */
    readonly senderTimestampMs?: number
}

export interface WaSendRevokeMessage {
    readonly type: 'revoke'
    /** Stanza id of the message being revoked. */
    readonly stanzaId: string
    /** Defaults to `true` (revoking your own messages). */
    readonly fromMe?: boolean
    /** Original author jid; required when an admin revokes someone else's message in a group. */
    readonly participant?: string
}

export interface WaSendPinMessage {
    readonly type: 'pin' | 'unpin'
    readonly target: WaSendMessageTarget
    readonly senderTimestampMs?: number
}

export interface WaSendEditKey {
    /** Stanza id of the message being edited (must be `fromMe: true`). */
    readonly stanzaId: string
    /** Required in groups when the original message uses lid/pn addressing on the participant. */
    readonly participant?: string
    /** Defaults to `Date.now()` when omitted. */
    readonly timestampMs?: number
}

export interface WaSendKeepMessage {
    readonly type: 'keep' | 'unkeep'
    readonly target: WaSendMessageTarget
    /** Defaults to `Date.now()` when omitted. */
    readonly timestampMs?: number
}

export interface WaSendPollOptionInput {
    readonly name: string
}

export interface WaSendPollMessage {
    readonly type: 'poll'
    readonly name: string
    /** Option names (strings) or `{ name }` objects. Order matters for vote hashing. */
    readonly options: readonly (string | WaSendPollOptionInput)[]
    /** How many options a voter may pick. Defaults to 1. */
    readonly selectableCount?: number
    readonly allowAddOption?: boolean
    readonly hideParticipantName?: boolean
    readonly contextInfo?: WaSendContextInfo
}

export interface WaSendPollParent {
    /** Stanza id of the original poll creation message. */
    readonly stanzaId: string
    readonly fromMe: boolean
    /** Group participant jid; required outside 1:1 chats. */
    readonly participant?: string
    /** Author of the original poll (parentMsgOriginalSender for the use-case secret). */
    readonly authorJid: string
    /** The poll's `messageContextInfo.messageSecret` (32 bytes). */
    readonly messageSecret: Uint8Array
}

export interface WaSendPollVoteMessage {
    readonly type: 'poll-vote'
    readonly poll: WaSendPollParent
    /** Option names exactly as they appeared in the poll. Hashed with SHA-256 internally. */
    readonly selectedOptionNames: readonly string[]
    /** Defaults to `Date.now()` when omitted. */
    readonly senderTimestampMs?: number
}

export interface WaSendEventLocation {
    readonly latitude: number
    readonly longitude: number
    readonly name?: string
    readonly address?: string
}

export interface WaSendEventMessage {
    readonly type: 'event'
    readonly name: string
    readonly description?: string
    /** Unix seconds. */
    readonly startTime: number
    /** Unix seconds. */
    readonly endTime?: number
    readonly location?: WaSendEventLocation
    readonly joinLink?: string
    readonly extraGuestsAllowed?: boolean
    readonly isScheduleCall?: boolean
    readonly isCanceled?: boolean
    readonly hasReminder?: boolean
    /** Reminder offset in seconds before `startTime`. */
    readonly reminderOffsetSec?: number
    readonly contextInfo?: WaSendContextInfo
}

export type WaSendEventResponseType = 'going' | 'not_going' | 'maybe'

export interface WaSendEventParent {
    /** Stanza id of the original event creation message. */
    readonly stanzaId: string
    readonly fromMe: boolean
    readonly participant?: string
    /** Creator of the event (parentMsgOriginalSender for the use-case secret). */
    readonly authorJid: string
    /** The event's `messageContextInfo.messageSecret` (32 bytes). */
    readonly messageSecret: Uint8Array
}

export interface WaSendEventResponseMessage {
    readonly type: 'event-response'
    readonly event: WaSendEventParent
    readonly response: WaSendEventResponseType
    readonly extraGuestCount?: number
    /** Defaults to `Date.now()` when omitted. */
    readonly timestampMs?: number
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

export type WaSendMessageContent =
    | string
    | WaSendTextMessage
    | WaSendReactionMessage
    | WaSendRevokeMessage
    | WaSendPinMessage
    | WaSendKeepMessage
    | WaSendPollMessage
    | WaSendPollVoteMessage
    | WaSendEventMessage
    | WaSendEventResponseMessage
    | Proto.IMessage
    | WaSendMediaMessage

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
