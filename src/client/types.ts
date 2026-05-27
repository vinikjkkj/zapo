import type { AppStateCollectionName } from '@appstate/types'
import type { DataForKey, WaAppstateActionKey, WaAppstateIndexArgs } from '@appstate-spec'
import type {
    WaAuthClientOptions,
    WaAuthCredentials,
    WaAuthDangerousOptions,
    WaAuthSocketOptions
} from '@auth/types'
import type { WaCallGroupParticipant, WaCallType } from '@client/events/call'
import type { IncomingPresenceType, PresenceLastSeen } from '@client/events/presence'
import type { WaMediaProcessor } from '@media/processor'
import type { WaLinkPreviewOptions } from '@message/addons/link-preview/types'
import type { WaQuoteRef, WaSendContextInfo } from '@message/context-info'
import type { WaDecodedAddon } from '@message/crypto/addon-crypto'
import type { WaMessagePublishOptions, WaSendEditKey } from '@message/types'
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
    /**
     * Store instance built by {@link createStore}. Holds every per-session
     * domain (auth, signal, app-state, ...). Required.
     */
    readonly store: WaStore
    /**
     * Logical session identifier – keys every domain inside `store`. Use a
     * stable string per device/account; changing it between runs orphans the
     * previous credentials.
     */
    readonly sessionId: string
    /**
     * Optional HTTP(S)/WS proxy configuration. You can target the WebSocket
     * (`ws`), media upload, media download, and link preview legs
     * independently – see {@link WaClientProxyOptions}.
     */
    readonly proxy?: WaClientProxyOptions
    /**
     * Override the WhatsApp chat WebSocket URL list. Defaults to the
     * production endpoints; useful for routing through a fake server in
     * tests or pinning a specific edge.
     */
    readonly chatSocketUrls?: readonly string[]
    /** Default timeout (ms) for IQ queries. Defaults to `WA_DEFAULTS.IQ_TIMEOUT_MS` (60s). */
    readonly iqTimeoutMs?: number
    /** Default timeout (ms) for raw node `query()` calls when none is passed. */
    readonly nodeQueryTimeoutMs?: number
    /** Interval (ms) between server ping IQs sent by the keep-alive loop. */
    readonly keepAliveIntervalMs?: number
    /**
     * How long (ms) the keep-alive may go without a server reply before the
     * socket is considered dead and a reconnect is triggered.
     */
    readonly deadSocketTimeoutMs?: number
    /** Default timeout (ms) for media upload/download requests. */
    readonly mediaTimeoutMs?: number
    /** Default timeout (ms) for app-state sync IQ rounds. */
    readonly appStateSyncTimeoutMs?: number
    /** Default timeout (ms) for Signal prekey-bundle fetches. */
    readonly signalFetchKeyBundlesTimeoutMs?: number
    /** How long (ms) `message.send` waits for the server `<ack>` per attempt. */
    readonly messageAckTimeoutMs?: number
    /** Max number of attempts for a single `message.send` before giving up. */
    readonly messageMaxAttempts?: number
    /** Delay (ms) between message-send retry attempts. */
    readonly messageRetryDelayMs?: number
    /**
     * Initial presence sent right after the post-connect passive task runs.
     * - `true` (default): announce the client as online – matches the wa-web
     *   behavior when the browser tab has focus at login time.
     * - `false`: announce as unavailable – matches wa-web when the tab is not
     *   focused (or the Windows app is minimized to tray) at login time. Useful
     *   for bots/headless sessions that should not appear "online" on connect.
     */
    readonly markOnlineOnConnect?: boolean
    /**
     * Write-behind persistence tuning – how long to batch incoming messages
     * before flushing to `messages`/`threads`/`contacts` stores.
     */
    readonly writeBehind?: WaWriteBehindOptions
    /**
     * History-sync behavior – enable initial history download, full vs.
     * recent sync, and external blob handling.
     */
    readonly history?: WaHistorySyncOptions
    /**
     * Chat-event emission tuning. `emitSnapshotMutations: true` re-emits
     * `app_state_mutation` events for every mutation seen during a snapshot
     * sync (off by default – those mutations represent historical state).
     */
    readonly chatEvents?: {
        readonly emitSnapshotMutations?: boolean
    }
    /**
     * Privacy-token (trusted-contact-token) cache tuning. Controls how often
     * tokens are re-issued and which JIDs they're scoped to.
     */
    readonly privacyToken?: WaPrivacyTokenOptions
    /**
     * Addon behavior – set `autoDecrypt: true` to automatically decrypt
     * encrypted addons (poll votes, reactions, ...) and emit them as typed
     * `message_addon` events.
     */
    readonly addons?: WaAddonOptions
    /**
     * Per-domain control of what {@link WaClient.logout} clears from the
     * store. Defaults to clearing everything; set a domain to `false` to
     * preserve it across logout.
     */
    readonly logoutStoreClear?: WaLogoutStoreClearOptions
    /**
     * Media handling tuning – optional {@link WaMediaProcessor} for
     * thumbnail/voice-note/sticker normalization plus generation flags.
     */
    readonly media?: WaMediaOptions
    /**
     * Link-preview fetcher configuration – provide a custom fetcher (e.g.
     * one that runs through your own scraping pipeline) or disable the
     * default auto-fetch globally.
     */
    readonly linkPreview?: WaLinkPreviewOptions
    /**
     * Test-only overrides intended for running against a fake server.
     *
     * These hooks **do not** bypass any security checks – they only swap in
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
     * chain signed by a known key – no validation logic is bypassed.
     */
    readonly noiseRootCa?: WaNoiseRootCa
}

export interface WaMediaOptions {
    readonly processor?: WaMediaProcessor
    readonly generateThumbnail?: boolean
    readonly generateProbe?: boolean
    readonly generateWaveform?: boolean
    readonly generateStickerThumbnail?: boolean
    readonly normalizeVoiceNote?: boolean
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
    /**
     * Override the auto-generated stanza id. Useful for retries with idempotent
     * ids or for clients that want to track messages by a known external id.
     */
    readonly id?: string
    /**
     * Identity key (33-byte serialized) the recipient is expected to be using.
     * Throws `identity mismatch` if the cached remote identity differs  -
     * forces an explicit recovery instead of silently sending to a new device.
     */
    readonly expectedIdentity?: Uint8Array
    /**
     * Disambiguator for the resolved `edit` stanza attribute. Today only
     * `'admin_revoke'` is meaningful – pass it when a group admin is
     * revoking another participant's message so the outgoing stanza is
     * tagged `edit="8"` (admin revoke) instead of `edit="7"` (sender revoke).
     * Any other value is ignored.
     */
    readonly subtype?: string
    /**
     * Optional context info to merge into the outgoing message – quoted message,
     * mentioned JIDs, forward score, link-preview override, etc. (see {@link WaSendContextInfo}).
     */
    readonly contextInfo?: WaSendContextInfo
    /**
     * Shorthand for replying to a message: pass the incoming event (or a
     * pre-built `WaQuoteRef`) and the coordinator fills the quote fields in
     * `contextInfo` for you.
     */
    readonly quote?: WaIncomingMessageEvent | WaQuoteRef
    /**
     * Mark as forwarded. `true` increments the forward score; `{ score }`
     * sets it explicitly (use the score from the source message's contextInfo
     * to propagate the "frequently forwarded" badge correctly).
     */
    readonly forward?: boolean | { readonly score?: number }
    /**
     * JIDs to mention (`@`-tag) in the message. Each must appear as `@<digits>`
     * in the text for WhatsApp to render the mention link.
     */
    readonly mentions?: readonly string[]
    /**
     * Skip the automatic `ephemeralSettingTimestamp`/`expiration` injection
     * applied for messages sent into groups with disappearing-mode on. Off by
     * default – only set when you're managing those fields manually.
     */
    readonly disableGroupEphemeralAutoInject?: boolean
    /** Raw child nodes appended to the `<message>` stanza. Escape hatch for protocol features the typed API doesn't cover. */
    readonly customNodes?: readonly BinaryNode[]
    /** Wrap the outgoing message as view-once. Only valid for image/video/audio content. */
    readonly viewOnce?: boolean
    /**
     * Edit a previously-sent message: the `content` argument becomes the new payload
     * and gets wrapped in a `MESSAGE_EDIT` protocolMessage targeting `editKey.stanzaId`.
     */
    readonly editKey?: WaSendEditKey
    /**
     * Override the auto-generated `messageContextInfo.messageSecret` (32 bytes).
     * Use to share a known secret across follow-up addons or for deterministic tests.
     */
    readonly messageSecret?: Uint8Array
    /**
     * Extra attributes merged into the outgoing `<message>` stanza. Keys provided
     * here override protocol-managed ones (`to`, `type`, `id`, `edit`, `phash`,
     * `addressing_mode`) – use with care: bad overrides can break the send.
     */
    readonly additionalAttributes?: Readonly<Record<string, string>>
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

export interface WaDownloadMediaOptions {
    readonly maxBytes?: number
    readonly timeoutMs?: number
    readonly signal?: AbortSignal
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
 * stanza before any handler runs – the coordinator still sends the appropriate
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
    readonly offline?: boolean
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

export type WaReceiptStatus = 'delivered' | 'read' | 'played' | 'inactive'

export interface WaIncomingReceiptEvent extends WaIncomingBaseEvent {
    readonly status: WaReceiptStatus
    /** True when the receipt came from another device of the current user (multi-device sync). */
    readonly fromSelfDevice: boolean
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

export interface WaIncomingCallEvent extends WaIncomingBaseEvent {
    /** Discriminator from the inner child tag (e.g. `offer`, `accept`, `terminate`). `unknown` when the child tag is missing or not recognized. */
    readonly type: WaCallType
    /** Original inner child tag, useful when `type === 'unknown'`. */
    readonly payloadTag?: string
    /** WhatsApp call identifier (from inner child `call-id`). */
    readonly callId?: string
    /** JID of the device that initiated the call. */
    readonly callCreatorJid?: string
    /** Sender LID of the call stanza, when present. */
    readonly senderLidJid?: string
    /** Phone-number JID of the caller, when present. */
    readonly callerPnJid?: string
    /** Group JID for group calls. */
    readonly groupJid?: string
    /** True when the call payload has a `<video/>` marker. */
    readonly isVideo: boolean
    readonly callerUsername?: string
    readonly callerCountryCode?: string
    readonly callerPushName?: string
    readonly peerPlatform?: string
    readonly peerAppVersion?: string
    /** Stanza timestamp (`t` attr, seconds since epoch). */
    readonly timestampSeconds?: number
    /** Stanza end-of-validity timestamp (`e` attr, seconds since epoch). */
    readonly endTimestampSeconds?: number
    /** Optional silence reason (e.g. `vc_wave_all`). */
    readonly silenceReason?: string
    /** Group participant snapshot, when the stanza includes `<group_info>`. */
    readonly groupInfo?: readonly WaCallGroupParticipant[]
}

export interface WaIncomingNotificationEvent extends WaIncomingBaseEvent {
    readonly notificationType?: string
    readonly classification?: 'core' | 'out_of_scope' | 'unknown' | 'info_bulletin'
    readonly details?: Readonly<Record<string, unknown>>
}

export interface WaMexNotificationGraphQlError {
    readonly message?: string
    readonly path?: readonly string[]
    readonly extensions?: {
        readonly error_code?: number
        readonly severity?: string
        readonly is_summary?: boolean
    }
}

export type WaMexNotificationOperationName =
    | 'UsernameSetNotification'
    | 'UsernameDeleteNotification'
    | 'UsernameUpdateNotification'
    | 'AccountSyncUsernameNotification'
    | 'TextStatusUpdateNotification'
    | 'TextStatusUpdateNotificationSideSub'
    | 'LidChangeNotification'
    | 'MessageCappingInfoNotification'
    | 'NotificationCommunityOwnerUpdate'
    | 'NotificationUserBrigadingUpdate'
    | 'NotificationUserReachoutTimelockUpdate'
    | 'NotificationIntegrityChallengeRequest'
    | 'NotificationScheduledMessagePost'
    | 'NotificationScheduledMessageReveal'
    | 'NotificationGroupPropertyUpdate'
    | 'NotificationGroupHiddenPropertyUpdate'
    | 'NotificationGroupSafetyCheckPropertyUpdate'
    | 'NotificationGroupMemberLinkPropertyUpdate'
    | 'NotificationGroupMemberShareGroupHistoryModePropertyUpdate'
    | 'NotificationGroupAppealStatusUpdate'
    | 'NotificationGroupLimitSharingPropertyUpdate'
    | 'NotificationNewsletterUserSettingChange'
    | 'NotificationNewsletterJoin'
    | 'NotificationNewsletterLeave'
    | 'NotificationNewsletterStateChange'
    | 'NotificationNewsletterAdminProfileUpdate'
    | 'NotificationNewsletterAdminMetadataUpdate'
    | 'NotificationNewsletterOwnerUpdate'
    | 'NotificationNewsletterUpdate'
    | 'NotificationNewsletterAdminPromote'
    | 'NotificationNewsletterAdminDemote'
    | 'NotificationNewsletterAdminInviteRevoke'
    | 'NotificationNewsletterWamoSubStatusChange'
    | 'NewsletterResponseStateUpdate'
    | 'NotificationNewsletterBlockUser'
    | 'NotificationNewsletterPaidPartnershipUpdate'
    | 'NotificationNewsletterMilestone'
    | 'MexNotificationEvent'
    | (string & {})

interface WaMexNotificationBaseFields extends WaIncomingBaseEvent {
    readonly operationName: WaMexNotificationOperationName
    readonly errors: readonly WaMexNotificationGraphQlError[]
}

export interface WaMexUsernameSetEvent extends WaMexNotificationBaseFields {
    readonly kind: 'username_set'
    readonly operationName: 'UsernameSetNotification'
    readonly lidJid: string
    readonly username: string
}

export interface WaMexUsernameDeleteEvent extends WaMexNotificationBaseFields {
    readonly kind: 'username_delete'
    readonly operationName: 'UsernameDeleteNotification'
    readonly lidJid: string
    readonly displayName: string | null
}

export interface WaMexUsernameUpdateHintEvent extends WaMexNotificationBaseFields {
    readonly kind: 'username_update_hint'
    readonly operationName: 'UsernameUpdateNotification'
    readonly contactHash: string
}

export interface WaMexOwnUsernameSyncEvent extends WaMexNotificationBaseFields {
    readonly kind: 'own_username_sync'
    readonly operationName: 'AccountSyncUsernameNotification'
    readonly ownLidJid: string
    readonly username: string | null
    readonly state: string | null
    readonly pin: string | null
}

export interface WaMexTextStatusUpdateEvent extends WaMexNotificationBaseFields {
    readonly kind: 'text_status_update'
    readonly operationName: 'TextStatusUpdateNotification'
    readonly jid: string
    readonly text: string | null
    readonly emoji: string | null
    readonly ephemeralDurationSec: number | null
    readonly lastUpdateTime: number | null
}

export interface WaMexTextStatusUpdateHintEvent extends WaMexNotificationBaseFields {
    readonly kind: 'text_status_update_hint'
    readonly operationName: 'TextStatusUpdateNotificationSideSub'
    readonly contactHash: string
}

export interface WaMexLidChangeEvent extends WaMexNotificationBaseFields {
    readonly kind: 'lid_change'
    readonly operationName: 'LidChangeNotification'
    readonly oldLidJid: string
    readonly newLidJid: string
}

export type WaMexMessageCappingStatus =
    | 'NONE'
    | 'FIRST_WARNING'
    | 'SECOND_WARNING'
    | 'CAPPED'
    | (string & {})

export interface WaMexMessageCappingEvent extends WaMexNotificationBaseFields {
    readonly kind: 'message_capping'
    readonly operationName: 'MessageCappingInfoNotification'
    readonly cappingStatus: WaMexMessageCappingStatus
    readonly oteStatus: string | null
    readonly mvStatus: string | null
    readonly totalQuota: number | null
    readonly usedQuota: number | null
    readonly cycleStartTimestamp: number | null
    readonly cycleEndTimestamp: number | null
    readonly serverSentTimestamp: number | null
}

export interface WaMexNotificationUnknownEvent extends WaMexNotificationBaseFields {
    readonly kind: 'unknown'
    readonly data: unknown
}

export type WaMexNotificationEvent =
    | WaMexUsernameSetEvent
    | WaMexUsernameDeleteEvent
    | WaMexUsernameUpdateHintEvent
    | WaMexOwnUsernameSyncEvent
    | WaMexTextStatusUpdateEvent
    | WaMexTextStatusUpdateHintEvent
    | WaMexLidChangeEvent
    | WaMexMessageCappingEvent
    | WaMexNotificationUnknownEvent

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

export type WaAddonKind =
    | 'reaction'
    | 'poll_vote'
    | 'event_response'
    | 'comment'
    | 'message_edit'
    | 'event_edit'
    | 'poll_edit'
    | 'poll_add_option'

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

export interface WaIncomingErrorStanzaEvent extends WaIncomingBaseEvent {
    readonly code?: number
    readonly text?: string
}

export interface WaNewsletterPollVoteEntry {
    readonly optionHash: Uint8Array
    readonly count?: number
}

export interface WaNewsletterReactionEntry {
    readonly code?: string
    readonly count?: number
}

export type WaNewsletterMessageUpdate =
    | {
          readonly kind: 'reaction'
          readonly isSender: boolean
          readonly revoked: boolean
          readonly reactions: ReadonlyArray<WaNewsletterReactionEntry>
      }
    | { readonly kind: 'revoke' }
    | { readonly kind: 'edit'; readonly plaintext: Uint8Array; readonly message: Proto.IMessage }
    | {
          readonly kind: 'poll_vote'
          readonly isSender: boolean
          readonly votes: ReadonlyArray<WaNewsletterPollVoteEntry>
      }
    | {
          readonly kind: 'counters'
          readonly views?: number
          readonly forwards?: number
          readonly responses?: number
      }

export interface WaIncomingNewsletterMessageUpdateEvent extends WaIncomingBaseEvent {
    readonly timestampSeconds?: number
    readonly parentMessageServerId?: number
    readonly update: WaNewsletterMessageUpdate
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

export type WaAppStateMutationSource = 'snapshot' | 'patch'

type MutationEventBase = {
    readonly source: WaAppStateMutationSource
    readonly collection: AppStateCollectionName
    readonly version: number
    readonly timestamp: number
    readonly _raw: {
        readonly index: string
        readonly indexParts: readonly string[]
        readonly value: Proto.ISyncActionValue | null
    }
}

export type WaAppStateMutationEvent = {
    readonly [K in WaAppstateActionKey]:
        | ({ readonly schema: K; readonly operation: 'set' } & MutationEventBase &
              WaAppstateIndexArgs<K> &
              Partial<DataForKey<K>>)
        | ({ readonly schema: K; readonly operation: 'remove' } & MutationEventBase &
              WaAppstateIndexArgs<K>)
}[WaAppstateActionKey]

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

/**
 * Type-safe event map for {@link WaClient}. Subscribe with
 * `client.on('event_name', (event) => ...)` and the payload is inferred.
 *
 * Events fall into a few groups: **auth** (`auth_*` – pairing flow),
 * **connection** (`connection`, `offline_resume`, `stream_failure`),
 * **messaging** (`message`, `message_addon`, `message_bot_chunk`,
 * `message_protocol`, `receipt`), **chat/presence**, per-feature
 * (`newsletter*`, `group`, `business`, `picture`, `mutation`,
 * `history_sync_chunk`, `mex_notification`, `call`), **mobile-only**
 * (`mobile_*`), and **debug_** (raw stanzas/frames – opt-in observability).
 */
export interface WaClientEventMap {
    /**
     * Pairing QR refresh – emitted while {@link WaClient.connect} runs and the
     * device has not been linked yet. `qr` is the string the phone scans;
     * `ttlMs` is the time until the next refresh (a new event will fire then).
     */
    readonly auth_qr: (event: { readonly qr: string; readonly ttlMs: number }) => void
    /** 8-character pairing code (link-code flow) – emitted after `requestPairingCode` returns. */
    readonly auth_pairing_code: (event: { readonly code: string }) => void
    /**
     * The server is ready to receive pairing input. `forceManual: true` means
     * the QR refresh budget was exhausted and the user must request a fresh
     * one (e.g. via the link-code flow).
     */
    readonly auth_pairing_required: (event: { readonly forceManual: boolean }) => void
    /**
     * Pairing succeeded – `credentials.meJid` is now populated. The client
     * persists the credentials before this event fires; `connect()` resolves
     * shortly after.
     */
    readonly auth_paired: (event: { readonly credentials: WaAuthCredentials }) => void
    /**
     * Connection-state transitions: `'open'` (handshake + auth complete),
     * `'connecting'`, or `'close'` (with a `reason` and optional `code`). The
     * client does **not** auto-reconnect on close – call {@link WaClient.connect} again.
     */
    readonly connection: (event: WaConnectionEvent) => void
    /**
     * An inbound `<message>` stanza was decrypted. The payload includes the
     * raw stanza, the decrypted {@link Proto.IMessage}, and resolved sender/
     * chat JIDs. Reply with {@link WaMessageCoordinator.send} (use
     * `options.quote` for threads).
     */
    readonly message: (event: WaIncomingMessageEvent) => void
    /**
     * A decrypted addon (poll vote, reaction, edit, comment, ...) attached to
     * a previous message. Fires only when `addons.autoDecrypt` is on **and**
     * the parent message secret is available in the cache.
     */
    readonly message_addon: (event: WaIncomingAddonEvent) => void
    /**
     * A streaming bot chunk (Meta-AI reply piece). Fires per chunk – concat
     * the `plaintext` in arrival order until you see the `editType === 'full'`
     * or `'last'` terminator.
     */
    readonly message_bot_chunk: (event: WaIncomingBotChunkEvent) => void
    /**
     * A decoded `protocolMessage` (revoke, ephemeral-setting change, history
     * sync notification, etc.) extracted from an incoming message. The plain
     * `message` event also fires for the same stanza; this one gives you the
     * typed protocol payload directly.
     */
    readonly message_protocol: (event: WaIncomingProtocolMessageEvent) => void
    /**
     * Inbound `<receipt>` for an outgoing message – delivery, read, played,
     * server, etc. Use this to track message ACK progression.
     */
    readonly receipt: (event: WaIncomingReceiptEvent) => void
    /** A newsletter (channel) event – create/update/follow/etc. or admin actions. */
    readonly newsletter: (event: WaIncomingNewsletterEvent) => void
    /** Newsletter message update – edit, react, view-count, poll-vote changes. */
    readonly newsletter_message_update: (event: WaIncomingNewsletterMessageUpdateEvent) => void
    /**
     * Peer presence (online / offline / last-seen). Only delivered for JIDs
     * the client previously subscribed via {@link WaPresenceCoordinator.subscribe}.
     */
    readonly presence: (event: WaIncomingPresenceEvent) => void
    /** Peer chatstate (typing / recording / paused) – also requires an active presence subscription. */
    readonly chatstate: (event: WaIncomingChatstateEvent) => void
    /** Incoming call signaling (offer / accept / reject / terminate). Read-only – this client doesn't place calls. */
    readonly call: (event: WaIncomingCallEvent) => void
    /**
     * MEX (GraphQL-over-noise) push notification – typed shape varies per
     * operation. Use the discriminator (`event.operationName`) or fall back
     * to the unknown variant for forward-compat.
     */
    readonly mex_notification: (event: WaMexNotificationEvent) => void
    /** Group lifecycle event – create, subject/description change, participant add/remove/promote/demote, leave, etc. */
    readonly group: (event: WaGroupEvent) => void
    /** Business profile change – verified name, profile updates, cover photo changes. */
    readonly business: (event: WaBusinessEvent) => void
    /** Profile/group/community picture change notification – the new picture must still be fetched explicitly. */
    readonly picture: (event: WaPictureEvent) => void
    /**
     * A parsed app-state mutation crossed the sync boundary – chat mute/star/
     * read/pin/archive/contact/label/etc. Use the discriminator
     * (`event.action`) to branch on the mutation kind.
     */
    readonly mutation: (event: WaAppStateMutationEvent) => void
    /**
     * One chunk of history-sync data while the primary device is mirroring
     * past chats. Multiple chunks per sync; track `event.progress` for
     * completion. Only fires when `history.enabled` is set.
     */
    readonly history_sync_chunk: (event: WaHistorySyncChunkEvent) => void
    /**
     * Offline-message queue progress after a reconnect (`'resuming'` ticks
     * with `remainingStanzas`, then `'complete'`). Useful to defer UI updates
     * until the catch-up finishes.
     */
    readonly offline_resume: (event: WaOfflineResumeEvent) => void
    /**
     * Fatal stream-level error from the server (e.g. logged out from another
     * device, stream conflict). The connection will close right after.
     */
    readonly stream_failure: (event: WaIncomingFailureEvent) => void
    /**
     * Server-sent error on a specific outgoing stanza – id mismatch, bad
     * request, throttling. The matching pending operation will already have
     * rejected; this event surfaces context for diagnostics.
     */
    readonly stanza_error: (event: WaIncomingErrorStanzaEvent) => void

    /**
     * SMS/voice verification code prompt during mobile-flow registration  -
     * only fires when using `mobileTransport`. Read the code from the
     * phone and feed it back via the registration API.
     */
    readonly mobile_registration_code: (event: WaRegistrationCodeEvent) => void
    /**
     * Account-takeover warning sent during mobile-flow registration when the
     * number is already linked to another device. Only relevant under
     * `mobileTransport`.
     */
    readonly mobile_account_takeover_notice: (event: WaAccountTakeoverNoticeEvent) => void

    /** **debug** – the success node closing the noise handshake; emitted before `connection: { status: 'open' }`. */
    readonly debug_connection_success: (event: { readonly node: BinaryNode }) => void
    /** **debug** – every inbound `<notification>` stanza, regardless of whether a typed handler matched. */
    readonly debug_notification: (event: WaIncomingNotificationEvent) => void
    /** **debug** – trusted-contact-token cache updates (issue / refresh / clear). */
    readonly debug_privacy_token: (event: WaPrivacyTokenUpdateEvent) => void
    /** **debug** – any error surfaced through the client error pipeline (already logged). */
    readonly debug_client_error: (event: { readonly error: Error }) => void
    /** **debug** – incoming stanzas with no registered handler (lets you spot protocol features the lib doesn't model yet). */
    readonly debug_unhandled_stanza: (event: WaIncomingUnhandledStanzaEvent) => void
    /** **debug** – raw inbound noise frame bytes (before binary-node decode). */
    readonly debug_transport_frame_in: (event: { readonly frame: Uint8Array }) => void
    /** **debug** – raw outbound noise frame bytes (after binary-node encode). */
    readonly debug_transport_frame_out: (event: { readonly frame: Uint8Array }) => void
    /** **debug** – decoded inbound {@link BinaryNode} plus its source frame. */
    readonly debug_transport_node_in: (event: {
        readonly node: BinaryNode
        readonly frame: Uint8Array
    }) => void
    /** **debug** – outbound {@link BinaryNode} plus the encoded frame about to ship. */
    readonly debug_transport_node_out: (event: {
        readonly node: BinaryNode
        readonly frame: Uint8Array
    }) => void
    /** **debug** – a frame that failed binary-node decoding (corrupted/unsupported). */
    readonly debug_transport_decode_error: (event: {
        readonly error: Error
        readonly frame: Uint8Array
    }) => void
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
