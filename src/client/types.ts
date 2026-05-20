import type { AppStateCollectionName } from '@appstate/types'
import type {
    WaAuthClientOptions,
    WaAuthCredentials,
    WaAuthDangerousOptions,
    WaAuthSocketOptions
} from '@auth/types'
import type { IncomingPresenceType, PresenceLastSeen } from '@client/events/presence'
import type { WaMediaProcessor } from '@media/processor'
import type { WaLinkPreviewOptions } from '@message/addons/link-preview/types'
import type { WaQuoteRef, WaSendContextInfo } from '@message/context-info'
import type { WaDecodedAddon } from '@message/crypto/addon-crypto'
import type { WaMessagePublishOptions } from '@message/types'
import type { Proto } from '@proto'
import type { WaBotMsgEditType } from '@protocol/bot'
import type { WaConnectionCode, WaConnectionOpenReason, WaDisconnectReason } from '@protocol/stream'
import type { WaStore } from '@store/types'
import type { ChatstateMedia, ChatstateState } from '@transport/node/builders/chatstate'
import type { WaNoiseRootCa } from '@transport/noise/WaNoiseCert'
import type { BinaryNode, WaProxyTransport } from '@transport/types'

export interface WaClientProxyOptions {
    readonly ws?: WaProxyTransport
    readonly mediaUpload?: WaProxyTransport
    readonly mediaDownload?: WaProxyTransport
    /**
     * Proxy used by the default link preview fetcher when fetching the page
     * HTML and the og:image bytes. Must be a `WaProxyDispatcher` (e.g. an
     * undici `ProxyAgent`); the global `fetch` does not consume `http.Agent`.
     * HQ thumbnail upload reuses `mediaUpload`.
     */
    readonly linkPreview?: WaProxyTransport
}

export interface WaLogoutStoreClearOptions {
    readonly auth?: boolean
    readonly signal?: boolean
    readonly preKey?: boolean
    readonly session?: boolean
    readonly identity?: boolean
    readonly senderKey?: boolean
    readonly appState?: boolean
    readonly retry?: boolean
    readonly groupMetadata?: boolean
    readonly deviceList?: boolean
    readonly messages?: boolean
    readonly messageSecret?: boolean
    readonly threads?: boolean
    readonly contacts?: boolean
    readonly privacyToken?: boolean
}

export interface WaClientOptions extends WaAuthClientOptions, WaAuthSocketOptions {
    readonly store: WaStore
    readonly sessionId: string
    readonly proxy?: WaClientProxyOptions
    readonly chatSocketUrls?: readonly string[]
    readonly iqTimeoutMs?: number
    readonly nodeQueryTimeoutMs?: number
    readonly keepAliveIntervalMs?: number
    readonly deadSocketTimeoutMs?: number
    readonly mediaTimeoutMs?: number
    readonly appStateSyncTimeoutMs?: number
    readonly signalFetchKeyBundlesTimeoutMs?: number
    readonly messageAckTimeoutMs?: number
    readonly messageMaxAttempts?: number
    readonly messageRetryDelayMs?: number
    /**
     * Initial presence sent right after the post-connect passive task runs.
     * - `true` (default): announce the client as online — matches the wa-web
     *   behavior when the browser tab has focus at login time.
     * - `false`: announce as unavailable — matches wa-web when the tab is not
     *   focused (or the Windows app is minimized to tray) at login time. Useful
     *   for bots/headless sessions that should not appear "online" on connect.
     */
    readonly markOnlineOnConnect?: boolean
    readonly writeBehind?: WaWriteBehindOptions
    readonly history?: WaHistorySyncOptions
    readonly chatEvents?: {
        readonly emitSnapshotMutations?: boolean
    }
    readonly privacyToken?: WaPrivacyTokenOptions
    readonly addons?: WaAddonOptions
    readonly logoutStoreClear?: WaLogoutStoreClearOptions
    readonly media?: WaMediaOptions
    readonly linkPreview?: WaLinkPreviewOptions
    /**
     * Test-only overrides intended for running against a fake server.
     *
     * These hooks **do not** bypass any security checks — they only swap in
     * test fixtures (e.g. a different root CA) so the full verification code
     * path still runs end-to-end. If you actually need to skip a check, use
     * `dangerous` instead.
     */
    readonly testHooks?: WaClientTestHooks
    /**
     * Dangerous escape hatches. **Do not enable in production.** Each flag here
     * disables a security check the production code path enforces.
     */
    readonly dangerous?: WaClientDangerousOptions
}

export interface WaClientDangerousOptions extends WaAuthDangerousOptions {
    /**
     * Skip the XEdDSA signature check on incoming group sender-key messages.
     * Ciphertexts will be decrypted even if the trailing signature does not
     * verify against the stored sender signing public key.
     */
    readonly disableSenderKeySignatureVerification?: boolean
    /**
     * Skip HMAC verification across the app-state sync pipeline: per-mutation
     * value and index MACs, snapshot MACs, and patch MACs. Tampered server
     * payloads will be accepted as long as the ciphertext decrypts cleanly.
     */
    readonly disableAppStateMacVerification?: boolean
    /**
     * Skip the truncated HMAC-SHA256 check on encrypted media payloads
     * during download. Tampered ciphertexts will still be decrypted.
     */
    readonly disableMediaMacVerification?: boolean
}

export interface WaClientTestHooks {
    /**
     * Override the noise certificate-chain root CA used to verify the
     * server's static key during the handshake.
     *
     * The default is the production WhatsApp root. Tests against a fake
     * server inject the fake server's ephemeral root here so that the lib
     * still runs the full certificate-verification code path against a
     * chain signed by a known key — no validation logic is bypassed.
     */
    readonly noiseRootCa?: WaNoiseRootCa
}

export interface WaMediaOptions {
    readonly processor?: WaMediaProcessor
    readonly generateThumbnail?: boolean
    readonly generateProbe?: boolean
    readonly generateWaveform?: boolean
    readonly generateStickerThumbnail?: boolean
}

export interface WaAddonOptions {
    readonly autoDecrypt?: boolean
}

export interface WaPrivacyTokenOptions {
    readonly tcTokenDurationS?: number
    readonly tcTokenNumBuckets?: number
    readonly tcTokenSenderDurationS?: number
    readonly tcTokenSenderNumBuckets?: number
    readonly tcTokenMaxDurationS?: number
}

export interface WaWriteBehindOptions {
    readonly maxPendingKeys?: number
    readonly maxWriteConcurrency?: number
    readonly flushTimeoutMs?: number
}

export interface WaHistorySyncOptions {
    readonly enabled?: boolean
    readonly requireFullSync?: boolean
}

export interface WaSignalMessagePublishInput {
    readonly to: string
    readonly plaintext: Uint8Array
    readonly expectedIdentity?: Uint8Array
    readonly id?: string
    readonly type?: string
    readonly category?: string
    readonly pushPriority?: string
    readonly participant?: string
    readonly deviceFanout?: string
}

export interface WaSendMessageOptions extends WaMessagePublishOptions {
    readonly id?: string
    readonly expectedIdentity?: Uint8Array
    readonly subtype?: string
    readonly contextInfo?: WaSendContextInfo
    readonly quote?: WaIncomingMessageEvent | WaQuoteRef
    readonly forward?: boolean | { readonly score?: number }
    readonly mentions?: readonly string[]
    readonly disableGroupEphemeralAutoInject?: boolean
    readonly customNodes?: readonly BinaryNode[]
}

export interface WaClearChatOptions {
    readonly deleteStarred?: boolean
    readonly deleteMedia?: boolean
}

export interface WaDeleteChatOptions {
    readonly deleteMedia?: boolean
}

/**
 * Subset of `proto.IMessageKey` used in app-state events. Field names differ:
 * `chatJid` aliases `remoteJid`, `participantJid` aliases `participant`. Kept
 * separate from the proto type because callers want non-optional `id`/`fromMe`.
 */
export interface WaAppStateMessageKey {
    readonly chatJid: string
    readonly id: string
    readonly fromMe: boolean
    readonly participantJid?: string
}

export interface WaDeleteMessageForMeOptions {
    readonly deleteMedia?: boolean
    readonly messageTimestampMs?: number
}

export type WaIncomingNodeHandler = (node: BinaryNode) => Promise<boolean>

export interface WaIncomingNodeHandlerRegistration {
    readonly tag: string
    readonly subtype?: string
    readonly handler: WaIncomingNodeHandler
    readonly prepend?: boolean
}

/**
 * Predicate evaluated against every inbound stanza. Return `true` to drop the
 * stanza before any handler runs — the coordinator still sends the appropriate
 * ack for `message`/`receipt`/`notification` so the server stops re-delivering.
 *
 * Stream-control nodes and the connection-critical `success`/`failure` tags
 * bypass filters to keep the auth flow intact.
 */
export type WaIncomingStanzaFilter = (node: BinaryNode) => boolean | Promise<boolean>

export interface WaIncomingBaseEvent {
    readonly rawNode: BinaryNode
    readonly stanzaId?: string
    readonly chatJid?: string
    readonly stanzaType?: string
}

export interface WaIncomingMessageEvent extends WaIncomingBaseEvent {
    readonly timestampSeconds?: number
    readonly senderJid?: string
    readonly senderAlt?: string
    readonly senderDevice?: number
    readonly senderUsername?: string
    readonly recipientJid?: string
    readonly recipientAlt?: string
    readonly pushName?: string
    readonly encryptionType?: string
    readonly isGroupChat: boolean
    readonly isBroadcastChat: boolean
    readonly isNewsletterChat?: boolean
    readonly serverId?: number
    readonly isSender?: boolean
    readonly plaintext?: Uint8Array
    readonly message?: Proto.IMessage
}

export interface WaIncomingProtocolMessageEvent extends WaIncomingMessageEvent {
    readonly protocolMessage: Proto.Message.IProtocolMessage
}

export interface WaIncomingReceiptEvent extends WaIncomingBaseEvent {
    readonly participantJid?: string
    readonly recipientJid?: string
}

export interface WaIncomingPresenceEvent extends WaIncomingBaseEvent {
    readonly type: IncomingPresenceType
    readonly lastSeen?: PresenceLastSeen
    readonly groupOnlineCount?: number
}

export interface WaIncomingChatstateEvent extends WaIncomingBaseEvent {
    readonly state: ChatstateState
    readonly media?: ChatstateMedia
    readonly participantJid?: string
}

// TODO: populate with call-specific fields (offer id, call type, from device,
// audio/video flag, etc.) and update WaIncomingNodeCoordinator's call handler
// to parse them out of the <call> stanza instead of only passing the base node.
export interface WaIncomingCallEvent extends WaIncomingBaseEvent {}

export interface WaIncomingNotificationEvent extends WaIncomingBaseEvent {
    readonly notificationType?: string
    readonly classification?: 'core' | 'out_of_scope' | 'unknown' | 'info_bulletin'
    readonly details?: Readonly<Record<string, unknown>>
}

export interface WaRegistrationCodeEvent extends WaIncomingBaseEvent {
    readonly code: string
    readonly expiryTimestampMs: number
    readonly fromDeviceId: string
}

export interface WaAccountTakeoverNoticeEvent extends WaIncomingBaseEvent {
    readonly serverToken: string
    readonly attemptTimestampMs: number
    readonly newDeviceName?: string
    readonly newDevicePlatform?: string
    readonly newDeviceAppVersion?: string
}

export type WaAddonKind = 'reaction' | 'poll_vote' | 'event_response' | 'comment'

export interface WaIncomingAddonEvent extends WaIncomingBaseEvent {
    readonly kind: WaAddonKind
    readonly targetMessageId: string
    readonly senderJid: string
    readonly decrypted: WaDecodedAddon
    readonly raw: Proto.IMessage
}

export interface WaIncomingBotChunkEvent extends WaIncomingBaseEvent {
    readonly senderJid: string
    readonly targetMessageId: string
    readonly editType: WaBotMsgEditType
    readonly editTargetId?: string
    readonly saltId: string
    readonly plaintext: Uint8Array
    readonly message: Proto.IMessage
    readonly raw: Proto.IMessage
}

export interface WaIncomingFailureEvent extends WaIncomingBaseEvent {
    readonly failureReason?: number
    readonly failureCode?: number
    readonly failureMessage?: string
    readonly failureUrl?: string
}

export interface WaIncomingUnhandledStanzaEvent extends WaIncomingBaseEvent {
    readonly reason: string
}

export interface WaIncomingNewsletterReactionEvent extends WaIncomingBaseEvent {
    readonly timestampSeconds?: number
    readonly parentMessageServerId?: number
    readonly reactionCode?: string
    readonly revoked: boolean
}

export type WaNewsletterEventAction =
    | 'subscribers_count_change'
    | 'live_updates'
    | 'membership_revoke'
    | 'admin_metadata_update'
    | 'unknown'

export interface WaIncomingNewsletterEvent extends WaIncomingBaseEvent {
    readonly newsletterJid: string
    readonly action: WaNewsletterEventAction
    readonly subType?: string
    readonly details?: Readonly<Record<string, unknown>>
}

export type WaGroupEventAction =
    | 'create'
    | 'add'
    | 'delete'
    | 'remove'
    | 'promote'
    | 'demote'
    | 'linked_group_promote'
    | 'linked_group_demote'
    | 'modify'
    | 'subject'
    | 'description'
    | 'restrict'
    | 'announce'
    | 'no_frequently_forwarded'
    | 'invite'
    | 'ephemeral'
    | 'revoke_invite'
    | 'suspend'
    | 'growth_locked'
    | 'growth_unlocked'
    | 'link'
    | 'unlink'
    | 'membership_approval_mode'
    | 'membership_approval_request'
    | 'created_membership_requests'
    | 'revoked_membership_requests'
    | 'allow_non_admin_sub_group_creation'
    | 'allow_admin_reports'
    | 'admin_reports'
    | 'created_sub_group_suggestion'
    | 'revoked_sub_group_suggestions'
    | 'change_number'
    | 'member_add_mode'
    | 'auto_add_disabled'
    | 'is_capi_hosted_group'
    | 'group_safety_check'
    | 'limit_sharing_enabled'
    | 'missing_participant_identification'

export interface WaGroupEventParticipant {
    readonly jid?: string
    readonly role?: string
    readonly lidJid?: string
    readonly phoneJid?: string
    readonly displayName?: string
    readonly username?: string
    readonly expirationSeconds?: number
}

export interface WaGroupEventLinkedGroup {
    readonly jid?: string
    readonly subject?: string
    readonly subjectTimestampSeconds?: number
    readonly hiddenSubgroup?: boolean
}

export interface WaGroupEventMembershipRequest {
    readonly jid?: string
    readonly username?: string
    readonly phoneJid?: string
}

export interface WaGroupEventSubgroupSuggestion {
    readonly groupJid?: string
    readonly ownerJid?: string
    readonly subject?: string
    readonly description?: string
    readonly timestampSeconds?: number
    readonly isExistingGroup?: boolean
    readonly participantCount?: number
    readonly reason?: string
}

export type WaBusinessEventAction =
    | 'verified_name_update'
    | 'verified_name_stale'
    | 'business_removed'
    | 'profile_update'
    | 'product_update'
    | 'collection_update'
    | 'subscriptions_update'

export interface WaBusinessCategory {
    readonly id: string
    readonly name: string
}

export interface WaBusinessHoursEntry {
    readonly dayOfWeek: string
    readonly mode: string
    readonly openTime?: number
    readonly closeTime?: number
}

export interface WaBusinessHours {
    readonly timezone?: string
    readonly config: readonly WaBusinessHoursEntry[]
}

export interface WaBusinessWebsite {
    readonly url: string
}

export interface WaBusinessProfileResult {
    readonly jid: string
    readonly tag?: string
    readonly description?: string
    readonly address?: string
    readonly email?: string
    readonly websites?: readonly WaBusinessWebsite[]
    readonly categories?: readonly WaBusinessCategory[]
    readonly businessHours?: WaBusinessHours
    readonly latitude?: number
    readonly longitude?: number
    readonly profileOptions?: Readonly<Record<string, string>>
}

export interface WaVerifiedNamePrivacyMode {
    readonly actualActors: number
    readonly hostStorage: number
    readonly privacyModeTs: number
}

export interface WaVerifiedNameResult {
    readonly name?: string
    readonly level?: string
    readonly serial?: string
    readonly isApi: boolean
    readonly isSmb: boolean
    readonly privacyMode?: WaVerifiedNamePrivacyMode
}

export interface WaBusinessCollectionUpdate {
    readonly id: string
    readonly reviewStatus?: string
    readonly rejectReason?: string
    readonly commerceUrl?: string
}

export interface WaBusinessSubscription {
    readonly id: string
    readonly status: string
    readonly tier?: number
    readonly source?: string
    readonly startTime?: number
    readonly creationTime?: number
    readonly expirationDate?: number
}

export interface WaBusinessFeatureFlag {
    readonly name: string
    readonly enabled: boolean
    readonly expirationTime?: number
    readonly limit?: number
}

export interface WaBusinessEvent extends WaIncomingBaseEvent {
    readonly action: WaBusinessEventAction
    readonly timestampSeconds?: number
    readonly bizJid?: string
    readonly bizHash?: string
    readonly verifiedName?: WaVerifiedNameResult
    readonly productIds?: readonly string[]
    readonly collections?: readonly WaBusinessCollectionUpdate[]
    readonly subscriptions?: readonly WaBusinessSubscription[]
    readonly featureFlags?: readonly WaBusinessFeatureFlag[]
}

export type WaPictureEventAction = 'set' | 'delete' | 'request' | 'set_avatar'

export interface WaPictureEvent extends WaIncomingBaseEvent {
    readonly action: WaPictureEventAction
    readonly targetJid?: string
    readonly authorJid?: string
    readonly timestampSeconds?: number
    readonly pictureId?: number
    readonly contactHash?: string
}

export interface WaGroupEvent extends WaIncomingBaseEvent {
    readonly rawActionNode: BinaryNode
    readonly groupJid?: string
    readonly authorJid?: string
    readonly timestampSeconds?: number
    readonly action: WaGroupEventAction
    readonly participants?: readonly WaGroupEventParticipant[]
    readonly linkedGroups?: readonly WaGroupEventLinkedGroup[]
    readonly membershipRequests?: readonly WaGroupEventMembershipRequest[]
    readonly subgroupSuggestions?: readonly WaGroupEventSubgroupSuggestion[]
    readonly contextGroupJid?: string
    readonly requestMethod?: string
    readonly subject?: string
    readonly subjectOwnerJid?: string
    readonly description?: string
    readonly descriptionId?: string
    readonly code?: string
    readonly expirationSeconds?: number
    readonly mode?: string
    readonly enabled?: boolean
    readonly reason?: string
    readonly details?: Readonly<Record<string, unknown>>
}

export interface WaHistorySyncChunkEvent {
    readonly syncType: number
    readonly messagesCount: number
    readonly conversationsCount: number
    readonly pushnamesCount: number
    readonly chunkOrder?: number
    readonly progress?: number
}

export type WaChatEventAction =
    | 'archive'
    | 'mute'
    | 'pin'
    | 'mark_read'
    | 'clear'
    | 'delete'
    | 'lock'
    | 'chat_assignment'
    | (string & {})

export type WaChatEventSource = 'snapshot' | 'patch'

export interface WaChatEvent {
    readonly action: WaChatEventAction
    readonly source: WaChatEventSource
    readonly collection: AppStateCollectionName
    readonly operation: 'set' | 'remove'
    readonly mutationIndex: string
    readonly indexAction?: string
    readonly indexParts?: readonly string[]
    readonly syncActionValueKey?: string
    readonly chatJid?: string
    readonly timestamp: number
    readonly version: number
    readonly archived?: boolean
    readonly muted?: boolean
    readonly muteEndTimestampMs?: number
    readonly pinned?: boolean
    readonly read?: boolean
    readonly deleteStarred?: boolean
    readonly deleteMedia?: boolean
    readonly locked?: boolean
    readonly deviceAgentId?: string
}

export interface WaStatusPrivacyEntry {
    readonly mode: number | null
    readonly userJids: readonly string[]
    readonly shareToFB?: boolean
    readonly shareToIG?: boolean
}

export interface WaBroadcastListMembershipEntry {
    readonly lidJid: string
    readonly pnJid?: string
}

interface WaAccountEventBase {
    readonly source: WaChatEventSource
    readonly collection: AppStateCollectionName
    readonly operation: 'set' | 'remove'
    readonly mutationIndex: string
    readonly indexAction: string
    readonly indexParts: readonly string[]
    readonly timestamp: number
    readonly version: number
}

export type WaAccountEvent =
    | (WaAccountEventBase & {
          readonly action: 'status_privacy'
          readonly settings: WaStatusPrivacyEntry
      })
    | (WaAccountEventBase & {
          readonly action: 'user_status_mute'
          readonly targetJid: string
          readonly muted: boolean | null
      })
    | (WaAccountEventBase & {
          readonly action: 'business_broadcast_list_set'
          readonly listId: string
          readonly listName: string
          readonly participants: readonly WaBroadcastListMembershipEntry[]
          readonly labelIds: readonly string[]
      })
    | (WaAccountEventBase & {
          readonly action: 'business_broadcast_list_remove'
          readonly listId: string
      })

export type WaConnectionEvent =
    | {
          readonly status: 'open'
          readonly reason: WaConnectionOpenReason
          readonly code: null
          readonly isLogout: false
          readonly isNewLogin: boolean
      }
    | {
          readonly status: 'close'
          readonly reason: WaDisconnectReason
          readonly code: WaConnectionCode | null
          readonly isLogout: boolean
          readonly isNewLogin: false
      }

export interface WaClientEventMap {
    readonly auth_qr: (event: { readonly qr: string; readonly ttlMs: number }) => void
    readonly auth_pairing_code: (event: { readonly code: string }) => void
    readonly auth_pairing_refresh: (event: { readonly forceManual: boolean }) => void
    readonly auth_paired: (event: { readonly credentials: WaAuthCredentials }) => void
    readonly connection_success: (event: { readonly node: BinaryNode }) => void
    readonly client_error: (event: { readonly error: Error }) => void
    readonly connection: (event: WaConnectionEvent) => void
    readonly transport_frame_in: (event: { readonly frame: Uint8Array }) => void
    readonly transport_frame_out: (event: { readonly frame: Uint8Array }) => void
    readonly transport_node_in: (event: {
        readonly node: BinaryNode
        readonly frame: Uint8Array
    }) => void
    readonly transport_node_out: (event: {
        readonly node: BinaryNode
        readonly frame: Uint8Array
    }) => void
    readonly transport_decode_error: (event: {
        readonly error: Error
        readonly frame: Uint8Array
    }) => void
    readonly message: (event: WaIncomingMessageEvent) => void
    readonly message_addon: (event: WaIncomingAddonEvent) => void
    readonly message_bot_chunk: (event: WaIncomingBotChunkEvent) => void
    readonly message_protocol: (event: WaIncomingProtocolMessageEvent) => void
    readonly message_receipt: (event: WaIncomingReceiptEvent) => void
    readonly newsletter_reaction: (event: WaIncomingNewsletterReactionEvent) => void
    readonly newsletter_event: (event: WaIncomingNewsletterEvent) => void
    readonly presence: (event: WaIncomingPresenceEvent) => void
    readonly chatstate: (event: WaIncomingChatstateEvent) => void
    readonly call: (event: WaIncomingCallEvent) => void
    readonly notification: (event: WaIncomingNotificationEvent) => void
    readonly registration_code_received: (event: WaRegistrationCodeEvent) => void
    readonly account_takeover_notice: (event: WaAccountTakeoverNoticeEvent) => void
    readonly failure: (event: WaIncomingFailureEvent) => void
    readonly stanza_error: (event: WaIncomingBaseEvent) => void
    readonly stanza_unhandled: (event: WaIncomingUnhandledStanzaEvent) => void
    readonly group_event: (event: WaGroupEvent) => void
    readonly business_event: (event: WaBusinessEvent) => void
    readonly picture_event: (event: WaPictureEvent) => void
    readonly chat_event: (event: WaChatEvent) => void
    readonly account_event: (event: WaAccountEvent) => void
    readonly history_sync_chunk: (event: WaHistorySyncChunkEvent) => void
    readonly privacy_token_update: (event: WaPrivacyTokenUpdateEvent) => void
    readonly offline_resume: (event: WaOfflineResumeEvent) => void
}

export interface WaOfflineResumeEvent {
    readonly status: 'resuming' | 'complete'
    readonly totalStanzas: number
    readonly remainingStanzas: number
    readonly forced: boolean
}

export interface WaPrivacyTokenUpdateEvent {
    readonly jid: string
    readonly timestampS: number
    readonly type: string
    readonly source: 'notification' | 'history_sync'
}
