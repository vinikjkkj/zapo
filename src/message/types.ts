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
    /** Token sent by a native form, including an automatically generated UUID.
     * @example `const { flowToken } = await client.message.send(jid, form)`
     */
    readonly flowToken?: string
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
    /** Native form correlation token, preserved by `client.message.send`. */
    readonly flowToken?: string
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

interface WaSendMessageContextInfo {
    /**
     * The `Message`-level `messageContextInfo` (not the media's `contextInfo`), e.g.
     * `messageAssociation`, whose `parentMessageKey.remoteJid` must be the resolved
     * chat JID (the LID for a LID chat).
     */
    readonly messageContextInfo?: Proto.IMessageContextInfo
}

interface WaSendMediaBase extends WaSendMessageContextInfo {
    readonly media: MediaInput
    /**
     * Mime type of the media. Optional when a {@link WaMediaProcessor} with
     * `detectMimetype` is configured (e.g. `@zapo-js/media-utils` with
     * `file-type` installed): the builder infers it from the input. Required
     * otherwise; a missing mimetype throws at build time.
     */
    readonly mimetype?: string
    readonly fileLength?: number
    readonly contextInfo?: WaSendContextInfo
}

export interface WaSendTextMessage extends WaSendMessageContextInfo {
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

/**
 * A message key in the protobuf {@link Proto.IMessageKey} shape, used to target
 * an existing message (reply / edit / reaction / revoke / pin / keep). Every
 * field is filled on a received `message` event's `key`, so they are required
 * here (and assignable to the looser `Proto.IMessageKey`). When sending, the
 * builder forces `remoteJid` to the recipient and drops `participant` in 1:1
 * chats.
 */
export interface WaMessageKey {
    readonly remoteJid: string
    readonly id: string
    readonly fromMe: boolean
    /** The author - set in groups/broadcasts; omitted in 1:1 (the author is `remoteJid`). */
    readonly participant?: string
}

/**
 * A received `message` event passed verbatim as a target. Its `key` (a
 * {@link WaMessageKey}, the same shape the event exposes) is what gets used;
 * `rawNode` - always present on real events - discriminates it from an explicit
 * {@link WaMessageKey}.
 */
export interface WaMessageRef {
    readonly key?: WaMessageKey
    readonly rawNode: unknown
}

/** An explicit {@link WaMessageKey}, or a received `message` event ({@link WaMessageRef}). */
export type WaMessageTargetInput = WaMessageKey | WaMessageRef

export interface WaSendReactionMessage extends WaSendMessageContextInfo {
    readonly type: 'reaction'
    /** Emoji to attach. Pass an empty string to revoke an existing reaction. */
    readonly emoji: string
    /** An explicit {@link WaMessageKey} or a received `message` event passed verbatim. */
    readonly target: WaMessageTargetInput
    /** Defaults to `Date.now()` when omitted. */
    readonly senderTimestampMs?: number
}

export interface WaSendRevokeMessage extends WaSendMessageContextInfo {
    readonly type: 'revoke'
    /** An explicit {@link WaMessageKey} or a received `message` event passed verbatim. */
    readonly target: WaMessageTargetInput
}

export interface WaSendPinMessage extends WaSendMessageContextInfo {
    readonly type: 'pin' | 'unpin'
    /** An explicit {@link WaMessageKey} or a received `message` event passed verbatim. */
    readonly target: WaMessageTargetInput
    readonly senderTimestampMs?: number
    /**
     * Pin expiry in seconds. wa-web's UI offers three presets: 86_400 (24h),
     * 604_800 (7d), 2_592_000 (30d). Defaults to 86_400 on `pin` and is
     * ignored on `unpin`. Without it the receiving clients drop the pin
     * silently, so this is effectively required to make the pin visible.
     */
    readonly durationSecs?: number
}

export interface WaSendEditKey {
    /** Id of the message being edited (`fromMe` is forced true, `remoteJid` is the recipient). */
    readonly id: string
    /** Required in groups when the original message uses lid/pn addressing on the participant. */
    readonly participant?: string
    /** Defaults to `Date.now()` when omitted. */
    readonly timestampMs?: number
}

export interface WaSendKeepMessage extends WaSendMessageContextInfo {
    readonly type: 'keep' | 'unkeep'
    /** An explicit {@link WaMessageKey} or a received `message` event passed verbatim. */
    readonly target: WaMessageTargetInput
    /** Defaults to `Date.now()` when omitted. */
    readonly timestampMs?: number
}

export interface WaSendPollOptionInput {
    readonly name: string
}

/**
 * The proto field the poll lands on is derived from these options, matching
 * what WhatsApp itself puts on the wire: `allowAddOption` or
 * `hideParticipantName` send a `pollCreationMessageV6`, a single-select poll
 * sends a `pollCreationMessageV3`, and a multi-select poll sends a
 * `pollCreationMessage`. Both flags are only serialized when `true`; sending
 * them as `false` makes receivers render the poll as an unsupported message.
 */
export interface WaSendPollMessage extends WaSendMessageContextInfo {
    readonly type: 'poll'
    readonly name: string
    /** Option names (strings) or `{ name }` objects. Order matters for vote hashing. */
    readonly options: readonly (string | WaSendPollOptionInput)[]
    /** How many options a voter may pick. Defaults to 1. */
    readonly selectableCount?: number
    /** Lets voters append their own options. Only honored by recent clients. */
    readonly allowAddOption?: boolean
    /** Hides who voted for what. Only honored by recent clients. */
    readonly hideParticipantName?: boolean
    readonly contextInfo?: WaSendContextInfo
}

export interface WaSendPollParent {
    /** Id of the original poll creation message. */
    readonly id: string
    readonly fromMe: boolean
    /** Group participant jid; required outside 1:1 chats. */
    readonly participant?: string
    /** Author of the original poll (parentMsgOriginalSender for the use-case secret). */
    readonly authorJid: string
    /** The poll's `messageContextInfo.messageSecret` (32 bytes). */
    readonly messageSecret: Uint8Array
}

export interface WaSendPollVoteMessage extends WaSendMessageContextInfo {
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

export interface WaSendEventMessage extends WaSendMessageContextInfo {
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
    /** Id of the original event creation message. */
    readonly id: string
    readonly fromMe: boolean
    readonly participant?: string
    /** Creator of the event (parentMsgOriginalSender for the use-case secret). */
    readonly authorJid: string
    /** The event's `messageContextInfo.messageSecret` (32 bytes). */
    readonly messageSecret: Uint8Array
}

export interface WaSendEventResponseMessage extends WaSendMessageContextInfo {
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
    extends WaSendMediaBase, UserMediaFields<Proto.Message.IStickerMessage> {
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

export interface WaSendStickerPackMessage
    extends
        WaSendMessageContextInfo,
        UserMediaFields<
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

/** Reply button. IDs must be unique within the message.
 * @example `const button: WaReplyButton = { id: 'accept', text: 'Accept' }`
 */
export interface WaReplyButton {
    readonly id: string
    readonly text: string
}

interface WaBusinessMessageBase extends WaSendMessageContextInfo {
    readonly text: string
    readonly footer?: string
    readonly contextInfo?: WaSendContextInfo
}

/** Up to three reply buttons, wrapped in documentWithCaptionMessage.
 * In groups, choosing a reply posts it to the whole group.
 * @example `await client.message.send(jid, { type: 'buttons', text: 'Continue?', buttons: [{ id: 'yes', text: 'Yes' }] })`
 */
export interface WaSendButtonsMessage extends WaBusinessMessageBase {
    readonly type: 'buttons'
    /** Omitted or empty headers use EMPTY; non-empty text uses TEXT. */
    readonly header?: string
    readonly buttons: readonly WaReplyButton[]
}

/** Native-flow action. Quick replies post the choice to the whole group in group chats.
 * Catalog actions require a business phone number, never a LID; omitted numbers use the account PN.
 * Copy actions use `code` for both `copy_code` and `id`. URL actions use `url` as `merchant_url`.
 * These field defaults are API choices, not protocol requirements.
 * @example `const button: WaNativeFlowButton = { type: 'cta_url', text: 'Visit', url: 'https://example.com', webview: true }`
 */
export type WaNativeFlowButton =
    | ({ readonly type: 'quick_reply' } & WaReplyButton)
    | {
          readonly type: 'cta_url'
          readonly text: string
          readonly url: string
          /** Requests a WebView with full presentation. */
          readonly webview?: boolean
      }
    | { readonly type: 'cta_copy'; readonly text: string; readonly code: string }
    | { readonly type: 'cta_call'; readonly text: string; readonly phoneNumber: string }
    | {
          readonly type: 'cta_catalog'
          readonly businessPhoneNumber?: string
          readonly productId?: string
      }

/** Native-flow buttons with an optional text header.
 * Accepts 1-10 quick replies or 1-3 CTA buttons; mixing the two categories throws.
 * A first cta_catalog button selects the cta_catalog business envelope.
 * @example `await client.message.send(jid, { type: 'interactive', text: 'Coupon', buttons: [{ type: 'cta_copy', text: 'Copy', code: 'SAVE10' }] })`
 */
export interface WaSendInteractiveMessage extends WaBusinessMessageBase {
    readonly type: 'interactive'
    readonly header?: string
    readonly buttons: readonly WaNativeFlowButton[]
}

/** A selectable list row. IDs must be unique across all sections.
 * @example `const row: WaListRow = { id: 'coffee', title: 'Coffee', description: 'Freshly brewed' }`
 */
export interface WaListRow {
    readonly id: string
    readonly title: string
    readonly header?: string
    readonly description?: string
}

/** A titled group of list rows.
 * @example `const section: WaListSection = { title: 'Drinks', rows: [{ id: 'tea', title: 'Tea' }] }`
 */
export interface WaListSection {
    readonly title: string
    readonly rows: readonly WaListRow[]
}

/** Native-flow single_select list.
 * Raw `listMessage` remains available for the separate list protocol.
 * For menu_options replies, read id/description params and the selected title in
 * interactiveResponseMessage.body.text. Read params with parseNativeFlowResponse.
 * @example `await client.message.send(jid, { type: 'list', text: 'Choose', buttonText: 'Menu', sections: [{ title: 'Drinks', rows: [{ id: 'tea', title: 'Tea' }] }] })`
 */
export interface WaSendListMessage extends WaBusinessMessageBase {
    readonly type: 'list'
    readonly buttonText: string
    readonly sections: readonly WaListSection[]
}

/** Carousel card whose image/video is uploaded using the normal media pipeline.
 * Video media.caption is omitted from the header; use text for the card body.
 * @example `const card: WaCarouselCard = { title: 'New', text: 'See details', media: { type: 'image', media: '/tmp/item.jpg', mimetype: 'image/jpeg' }, buttons: [{ type: 'cta_url', text: 'View', url: 'https://example.com' }] }`
 */
export interface WaCarouselCard {
    readonly title: string
    readonly text: string
    readonly media: Extract<WaSendMediaMessage, { readonly type: 'image' | 'video' }>
    readonly buttons: readonly WaNativeFlowButton[]
}

/** Media carousel with 1-100 cards. Uploads run sequentially; the singular result.upload is not set.
 * Quick replies in cards post to the whole group when sent to a group.
 * @example `await client.message.send(jid, { type: 'carousel', text: 'Our selection', cards: [card] })`
 */
export interface WaSendCarouselMessage extends WaBusinessMessageBase {
    readonly type: 'carousel'
    readonly cards: readonly WaCarouselCard[]
}

/** WhatsApp Business app form (galaxy_message), sent with the mixed business node.
 * The form must exist. The returned publish result exposes the token as `flowToken`.
 * @example `const { flowToken } = await client.message.send(jid, { type: 'native-form', text: 'Your details', flowId: '123', flowCta: 'Fill form' })`
 */
export interface WaSendNativeFormMessage extends WaBusinessMessageBase {
    readonly type: 'native-form'
    /** Decimal digits only, kept as a string to preserve large IDs and leading zeros. */
    readonly flowId: string
    readonly flowCta: string
    /** Defaults to template. */
    readonly formType?: string
    /** Defaults to a new UUID for each send. */
    readonly flowToken?: string
    readonly flowActionPayload?: {
        readonly screen?: string
        readonly data?: Readonly<Record<string, unknown>>
    }
}

/** Static PIX key settings. PHONE keys should use E.164.
 * @example `const pix: WaPixSettings = { merchantName: 'Shop', key: 'pay@example.com', keyType: 'EMAIL' }`
 */
export interface WaPixSettings {
    readonly merchantName: string
    readonly key: string
    readonly keyType: 'EVP' | 'EMAIL' | 'PHONE' | 'CPF' | 'CNPJ'
}

/** PIX key card (payment_info), with zero order/total amounts.
 * @example `await client.message.send(jid, { type: 'payment', text: 'Pay via PIX', referenceId: 'PIX-1', pix: { merchantName: 'Shop', key: 'pay@example.com', keyType: 'EMAIL' } })`
 */
export interface WaSendPaymentMessage extends WaBusinessMessageBase {
    readonly type: 'payment'
    readonly referenceId: string
    readonly pix: WaPixSettings
    readonly displayText?: string
}

/** Charge line item. Amount is the unit price in major currency units, rounded to cents.
 * @example `const item: WaChargeItem = { name: 'Coffee', amount: 5.5, quantity: 2 }`
 */
export interface WaChargeItem {
    readonly name: string
    readonly amount: number
    readonly quantity: number
}

/** PIX checkout (review_and_pay). Amounts are BRL major units, rounded to cents.
 * Total must equal the item subtotal minus the optional discount. Items are custom items.
 * @example `await client.message.send(jid, { type: 'charge', text: 'Your order', referenceId: 'ORDER-1', total: 11, items: [{ name: 'Coffee', amount: 5.5, quantity: 2 }], pix })`
 */
export interface WaSendChargeMessage extends WaBusinessMessageBase {
    readonly type: 'charge'
    readonly referenceId: string
    readonly pix: WaPixSettings
    readonly total: number
    readonly items: readonly WaChargeItem[]
    readonly discount?: number
    readonly additionalNote?: string
}

/** Business catalog button. Defaults to the account phone number (never its LID).
 * @example `await client.message.send(jid, { type: 'catalog', text: 'Browse our catalog', thumbnailProductRetailerId: 'sku-1' })`
 */
export interface WaSendCatalogMessage extends WaBusinessMessageBase {
    readonly type: 'catalog'
    readonly businessPhoneNumber?: string
    readonly thumbnailProductRetailerId?: string
}

/** Native catalog product. Requires a real product in the owner's business catalog.
 * Prices are major currency units, multiplied by 1000 and rounded. Owner defaults to the account PN JID.
 * `productImage` must already be uploaded (e.g. using `client.message.upload`).
 * @example `await client.message.send(jid, { type: 'product', productId: '123', title: 'Hat', currencyCode: 'BRL', price: 49.9 })`
 */
export interface WaSendProductMessage extends WaSendMessageContextInfo {
    readonly type: 'product'
    readonly productId: string
    readonly title: string
    readonly description?: string
    readonly currencyCode: string
    readonly price: number
    readonly salePrice?: number
    readonly retailerId?: string
    readonly url?: string
    readonly productImage?: Proto.Message.IImageMessage
    /** Defaults to 1 when productImage is present. */
    readonly productImageCount?: number
    readonly businessOwnerJid?: string
    readonly text?: string
    readonly footer?: string
    readonly contextInfo?: WaSendContextInfo
}

/** Typed interactive and business content accepted by send.
 * @example `const content: WaSendBusinessMessage = { type: 'catalog', text: 'Browse' }`
 */
export type WaSendBusinessMessage =
    | WaSendButtonsMessage
    | WaSendInteractiveMessage
    | WaSendListMessage
    | WaSendCarouselMessage
    | WaSendNativeFormMessage
    | WaSendPaymentMessage
    | WaSendChargeMessage
    | WaSendCatalogMessage
    | WaSendProductMessage

export type WaSendTypedMessage =
    | WaSendBusinessMessage
    | WaSendTextMessage
    | WaSendReactionMessage
    | WaSendRevokeMessage
    | WaSendPinMessage
    | WaSendKeepMessage
    | WaSendPollMessage
    | WaSendPollVoteMessage
    | WaSendEventMessage
    | WaSendEventResponseMessage
    | WaSendMediaMessage

export type WaSendMessageContent = string | WaSendTypedMessage | Proto.IMessage

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
    /**
     * Trusted-contact (privacy) token node, appended as a `<tctoken>` child.
     * Recipients that require one nack a token-less send with error 463.
     */
    readonly privacyTokenNode?: BinaryNode
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
