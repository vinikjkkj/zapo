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
import type {
    WaMessageKey,
    WaMessagePublishOptions,
    WaMessageRef,
    WaSendEditKey
} from '@message/types'
import type { Proto } from '@proto'
import type { WaBotMsgEditType } from '@protocol/bot'
import type { WaBusinessHoursDay, WaBusinessHoursMode } from '@protocol/business'
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

/**
 * Per-domain control over what {@link WaClient.logout} wipes from the store.
 *
 * Defaults (when the domain is left `undefined`):
 * - `messages`, `threads`, `contacts` → **preserved** (mailbox archive
 *   survives logout; the user keeps their history when re-pairing).
 * - everything else → **cleared** (credentials, Signal state, app-state,
 *   caches, privacy tokens: all need a clean slate for the new pair).
 *
 * Explicit `true`/`false` always wins. To wipe the mailbox too, pass
 * `{ messages: true, threads: true, contacts: true }`.
 */
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
     * - `false` (default): announce as unavailable – matches wa-web when the
     *   tab is not focused (or the Windows app is minimized to tray) at login
     *   time, and keeps headless bots/automation invisible by default.
     * - `true`: announce the client as online – matches wa-web behavior when
     *   the browser tab has focus at login time.
     */
    readonly markOnlineOnConnect?: boolean
    /**
     * Automatically reconnect when the server rejects the noise handshake
     * with HTTP 405 / `failure_client_too_old`. On every 405 the client
     * logs a warning asking you to upgrade zapo, fetches the current
     * version from `web.whatsapp.com` via `fetchLatestWaWebVersion()`,
     * swaps it in for the next connect, and retries. Off by default.
     */
    readonly recoverFromClientTooOld?: boolean
    /**
     * Write-behind persistence tuning – how long to batch incoming messages
     * before flushing to `messages`/`threads`/`contacts` stores.
     */
    readonly writeBehind?: WaWriteBehindOptions
    /**
     * History-sync behavior. By default chunks pushed via
     * `historySyncNotification` (both the initial bootstrap and the
     * on-demand backfill triggered by `message.requestHistorySync`) are
     * downloaded and emitted as `history_sync_chunk` events. Set
     * `enabled: false` to drop them; `requireFullSync: true` asks the
     * primary device for a full history download instead of just recent.
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
     * Addon behavior. Encrypted addons (poll votes, reactions, ...) are
     * decrypted automatically and emitted as typed `message_addon` events
     * by default; set `autoDecrypt: false` to receive them encrypted and
     * decrypt yourself via `client.message.tryDecryptAddon(event)`.
     */
    readonly addons?: WaAddonOptions
    /**
     * Per-domain control of what {@link WaClient.logout} clears from the
     * store. By default the mailbox archive (`messages`, `threads`,
     * `contacts`) is **preserved** and every other domain is cleared. See
     * {@link WaLogoutStoreClearOptions} for the per-domain defaults.
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
    /**
     * Decrypt incoming addon ciphertexts (poll votes, reactions, message
     * edits, ...) and emit them as typed `message_addon` events. On by
     * default - set to `false` to receive the encrypted payload and
     * decrypt yourself via `client.message.tryDecryptAddon(event)`. The
     * parent message secret is looked up in the `messageSecret` cache
     * first, then in the `messages` store; setting both to `'none'`
     * defeats addon decryption. Failures are logged at `warn` for
     * `secretEncryptedMessage` addons (whose parent can be any message
     * type) and at `debug` for the dedicated addon types (reactions,
     * poll votes, event responses, comments).
     */
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
    /**
     * Whether to process the `historySyncNotification` protocol messages
     * that WhatsApp pushes on first connect (initial bootstrap) and via
     * `message.requestHistorySync` (on-demand). On by default - set to
     * `false` to drop the chunks silently (useful when you do not persist
     * mailbox/threads/contacts and the conversation download would just
     * burn bandwidth).
     */
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
    readonly metaNode?: BinaryNode
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
     * Optional context info to merge into the outgoing message – quoted message,
     * mentioned JIDs, forward score, link-preview override, etc. (see {@link WaSendContextInfo}).
     */
    readonly contextInfo?: WaSendContextInfo
    /**
     * Shorthand for replying to a message: pass the incoming event (or a
     * pre-built `WaQuoteRef`) and the coordinator fills the quote fields in
     * `contextInfo` for you.
     */
    readonly quote?: WaIncomingMessageEvent | WaQuoteRef | WaMessageKey
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
     * Disappearing-message expiration in seconds for this message. When set (any
     * value, including `0`), this is the winner: it overrides both
     * `contextInfo.expirationSeconds` and the automatic group-ephemeral inject
     * (the latter is short-circuited because the value is now defined). To send a
     * single message with NO expiration into a group with disappearing-mode on,
     * prefer `disableGroupEphemeralAutoInject: true` over `expirationSeconds: 0` —
     * the latter still writes `expiration=0` into the outgoing `contextInfo`.
     */
    readonly expirationSeconds?: number
    /**
     * Skip the automatic `ephemeralSettingTimestamp`/`expiration` injection
     * applied to messages sent into groups with disappearing-mode on (the cached
     * group ephemeral is otherwise fetched and applied for you). Off by default.
     *
     * Relationship with {@link expirationSeconds}: a non-undefined
     * `expirationSeconds` already short-circuits the auto-inject, so this flag is
     * redundant in that case. Use this flag when you want to suppress the
     * auto-inject AND not set any expiration yourself.
     */
    readonly disableGroupEphemeralAutoInject?: boolean
    /** Raw child nodes appended to the `<message>` stanza. Escape hatch for protocol features the typed API doesn't cover. */
    readonly customNodes?: readonly BinaryNode[]
    /** Wrap the outgoing message as view-once. Only valid for image/video/audio content. */
    readonly viewOnce?: boolean
    /**
     * Edit a previously-sent message: the `content` argument becomes the new payload
     * and gets wrapped in a `MESSAGE_EDIT` protocolMessage targeting the message id.
     * Pass a received `message` event verbatim, its `key`, or an explicit
     * {@link WaSendEditKey} (`fromMe` is forced true, `remoteJid` is the recipient).
     */
    readonly editKey?: WaMessageKey | WaSendEditKey | WaMessageRef
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

/** Stanza tags addressable through {@link WaIgnoreKey}. */
export type WaIgnoreStanzaKind =
    | 'message'
    | 'receipt'
    | 'notification'
    | 'presence'
    | 'chatstate'
    | 'call'

/**
 * Match descriptor for {@link WaClient.ignoreKey}. Fields AND; `remoteJid`
 * array ORs. `remoteJid` and `participant` also match the `sender_pn` /
 * `sender_lid` / `participant_pn` / `participant_lid` alt attrs on `<message>`
 * (and `sender_lid` on `<call>`), so one JID form catches the other for those
 * tags. At least one of `remoteJid` / `fromMe` / `id` / `participant` required.
 */
export interface WaIgnoreKey {
    readonly remoteJid?: string | readonly string[]
    readonly fromMe?: boolean
    readonly id?: string
    readonly participant?: string
    /** Restrict to specific kinds. Default: all six. */
    readonly only?: readonly WaIgnoreStanzaKind[]
}

/**
 * Parsed view of an inbound stanza passed to {@link WaIgnoreKeyPredicate}.
 * Lib derives `kind` from the stanza tag and resolves `fromMe` by comparing
 * every from-candidate (`from`, `sender_pn`, `sender_lid`) against `meJid`.
 *
 * `remoteJid` and `participant` are the `from` / `participant` attrs with the
 * `:device` segment stripped (bare `user@server`), matching the JID form used
 * by message events and keys. A value that does not parse as a JID (e.g. a
 * userless server `from` like `s.whatsapp.net`) is passed through unchanged.
 * They do NOT include the descriptor-style
 * alt-attr lookups (`sender_pn` / `sender_lid` / `participant_pn` /
 * `participant_lid`) or PN↔LID normalization, so they stay in whichever
 * addressing mode the stanza arrived in. To match by user identity regardless
 * of addressing mode, use the descriptor form, which handles it.
 */
export interface WaIgnoreKeyContext {
    readonly kind: WaIgnoreStanzaKind
    /** `from` attr without `:device` (group JID for groups, PN or LID user JID for 1:1). */
    readonly remoteJid: string | null
    readonly fromMe: boolean
    readonly id: string | undefined
    /** `participant` attr without `:device`; `null` for non-group stanzas. */
    readonly participant: string | null
}

/**
 * Predicate form of {@link WaClient.ignoreKey}. Return `true` to drop the
 * stanza, `false` to let it through. Receives a {@link WaIgnoreKeyContext}
 * with the device-stripped `from`/`participant` (see the context's JSDoc for
 * the addressing-mode caveat) plus lib-resolved `kind` and `fromMe`.
 */
export type WaIgnoreKeyPredicate = (ctx: WaIgnoreKeyContext) => boolean

export interface WaIncomingBaseEvent {
    /** The raw decoded stanza, kept for forward-compat parsing of fields the typed event does not expose. */
    readonly rawNode: BinaryNode
    readonly stanzaId?: string
    /** Resolved from the stanza's `from` attr. */
    readonly chatJid?: string
    /** Inner-payload discriminator (notification subtype, message kind, ...). */
    readonly stanzaType?: string
    /** `true` when the stanza arrived as part of an offline catch-up batch rather than live. */
    readonly offline?: boolean
}

/**
 * A received message's key. Extends the proto {@link WaMessageKey}
 * (`remoteJid`/`id`/`fromMe`/`participant`) with the message's addressing and
 * sender metadata. It stays assignable to `Proto.IMessageKey` (the extra fields
 * are ignored there) and can be passed verbatim to reply / edit / react /
 * revoke / pin / quote.
 */
export interface WaIncomingMessageKey extends WaMessageKey {
    readonly isGroup: boolean
    readonly isBroadcast: boolean
    readonly isNewsletter: boolean
    /** The `remoteJid`'s alternate addressing — the pn when addressed by lid, or vice-versa (1:1 chats). */
    readonly remoteJidAlt?: string
    /** The `participant`'s alternate addressing — the pn when addressed by lid, or vice-versa (group chats). */
    readonly participantAlt?: string
    /** Sender's device id — `0` when the source JID has no `:device` segment. */
    readonly senderDevice: number
    readonly senderUsername?: string
    readonly recipientJid?: string
    readonly recipientAlt?: string
    /** Server-assigned message id (newsletters / channel messages). */
    readonly serverId?: number
}

export interface WaIncomingMessageEvent extends Omit<WaIncomingBaseEvent, 'chatJid' | 'stanzaId'> {
    /**
     * The message key: the proto fields (`remoteJid` = chat, `id` = stanza id,
     * `fromMe`, `participant` = author) plus chat/sender addressing metadata
     * (`isGroup`, `participantAlt`, ...). Pass it (or the whole event) verbatim to
     * reply / edit / react / revoke / pin / quote. `remoteJid`/`id` supersede the
     * old top-level `chatJid`/`stanzaId`.
     */
    readonly key: WaIncomingMessageKey
    /** Stanza `t` attr (seconds since epoch). */
    readonly timestampSeconds?: number
    /**
     * Disappearing-message TTL the sender attached to this message, in seconds.
     * Read from the first submessage carrying `contextInfo.expiration`
     * (`extendedTextMessage`, `imageMessage`, …). Undefined when the message is
     * not ephemeral.
     */
    readonly expirationSeconds?: number
    /** Sender's display name from the stanza's `notify` attr. */
    readonly pushName?: string
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
    /**
     * All message ids this receipt acknowledges. For batch read/delivery
     * receipts this is the `<list><item>` ids plus the top-level `stanzaId`;
     * for single receipts it is just `[stanzaId]`. Mirrors WhatsApp Web's
     * `externalIds`.
     */
    readonly messageIds: readonly string[]
}

export interface WaIncomingPresenceEvent extends WaIncomingBaseEvent {
    readonly type: IncomingPresenceType
    /** Only populated for 1:1 chats when `type === 'unavailable'` and the peer ships a `last` attr. */
    readonly lastSeen?: PresenceLastSeen
    /** Only populated for group JIDs. Falls back to `0` when the server marks the group `unavailable`. */
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
    /** `sender_lid` attr from the outer `<call>` stanza – distinct from `callCreatorJid` which lives on the inner payload. */
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
    /** Peer platform string from the outer call stanza. */
    readonly peerPlatform?: string
    /** Peer app version string from the outer call stanza. */
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
    /**
     * Routing bucket the lib chose: `'core'` (a typed handler exists – this debug event
     * mirrors it), `'out_of_scope'` (recognized server type intentionally not modeled),
     * `'unknown'` (server type the lib has not seen), or `'info_bulletin'` (the dedicated
     * `info_bulletin` notification type).
     */
    readonly classification?: 'core' | 'out_of_scope' | 'unknown' | 'info_bulletin'
    /** Decoded payload bag for notifications without a dedicated typed event. */
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
    /** `null` when the server omits the fallback display name (treat as cleared). */
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
    /** `null` means the username was removed. */
    readonly username: string | null
    readonly state: string | null
    readonly pin: string | null
}

export interface WaMexTextStatusUpdateEvent extends WaMexNotificationBaseFields {
    readonly kind: 'text_status_update'
    readonly operationName: 'TextStatusUpdateNotification'
    readonly jid: string
    /** `null` clears the status. */
    readonly text: string | null
    /** `null` clears the emoji. */
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
    /** Catch-all bucket for any `operationName` without a typed variant. */
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
    /** Expiry deadline (ms since epoch). */
    readonly expiryTimestampMs: number
    readonly fromDeviceId: string
}

export interface WaAccountTakeoverNoticeEvent extends WaIncomingBaseEvent {
    /** Opaque token to feed back into the takeover-decision API. */
    readonly serverToken: string
    /** Ms since epoch. */
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

export interface WaIncomingAddonEvent extends Omit<WaIncomingBaseEvent, 'chatJid' | 'stanzaId'> {
    /**
     * The addon message's key (proto fields + addressing metadata). The sender is
     * `key.participant ?? key.remoteJid`. Supersedes the old `chatJid` / `stanzaId`
     * / `senderJid`.
     */
    readonly key: WaIncomingMessageKey
    readonly kind: WaAddonKind
    /** Stanza id of the parent message this addon attaches to. */
    readonly targetMessageId: string
    /** Decoded addon payload (shape varies per `kind`). */
    readonly decrypted: WaDecodedAddon
    /** Parent proto message the addon was extracted from. */
    readonly raw: Proto.IMessage
}

export interface WaIncomingBotChunkEvent extends Omit<WaIncomingBaseEvent, 'chatJid' | 'stanzaId'> {
    /**
     * The chunk message's key (proto fields + addressing metadata). The sender is
     * `key.participant ?? key.remoteJid`. Supersedes the old `chatJid` / `stanzaId`
     * / `senderJid`.
     */
    readonly key: WaIncomingMessageKey
    /** Stanza id of the parent bot reply the chunks reassemble into. */
    readonly targetMessageId: string
    readonly editType: WaBotMsgEditType
    readonly editTargetId?: string
    readonly saltId: string
    /** Decrypted bytes for this chunk – concat in arrival order until `editType` is `'full'` or `'last'`. */
    readonly plaintext: Uint8Array
    readonly message: Proto.IMessage
    readonly raw: Proto.IMessage
}

export interface WaIncomingFailureEvent extends WaIncomingBaseEvent {
    /** Server-side reason number (`reason` attr). Drives the client's logout/disconnect behavior – specific values trigger credential wipe. */
    readonly failureReason?: number
    readonly failureCode?: number
    readonly failureMessage?: string
    readonly failureUrl?: string
}

export interface WaIncomingUnhandledStanzaEvent extends WaIncomingBaseEvent {
    /** Short reason describing why the dispatcher did not match a typed handler. */
    readonly reason: string
}

export interface WaIncomingErrorStanzaEvent extends WaIncomingBaseEvent {
    readonly code?: number
    readonly text?: string
}

export interface WaNewsletterPollVoteEntry {
    /** Hash to match against `pollCreation.options[].optionHash`. */
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
    /** Decoded payload bag for actions without dedicated fields. */
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
    /** Primary participant addressing as carried in the stanza – LID or PN. */
    readonly jid?: string
    /** Role label from the participant's `type` attr (`'admin'`, `'superadmin'`, or absent for plain members). */
    readonly role?: string
    readonly lidJid?: string
    readonly phoneJid?: string
    readonly displayName?: string
    readonly username?: string
    /** Ephemeral TTL the participant joined under, in seconds (set on `add`). */
    readonly expirationSeconds?: number
}

export interface WaGroupEventLinkedGroup {
    readonly jid?: string
    readonly subject?: string
    readonly subjectTimestampSeconds?: number
    /** `true` when the linked subgroup stanza carries a `<hidden_group/>` marker. */
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
    /** `true` when the suggestion points at an existing group; `false` when it would create one. */
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
    readonly dayOfWeek: WaBusinessHoursDay
    readonly mode: WaBusinessHoursMode
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
    /** Set on `verified_name_update`, `business_removed` (when the stanza identifies the business by JID), and `profile_update` (falls back to the stanza's `from` attr). */
    readonly bizJid?: string
    /** Certificate / payload hash on `verified_name_stale`, `business_removed` (when identified by hash), and `profile_update` (when the server signals just an unchanged hash). */
    readonly bizHash?: string
    /** Set on `verified_name_update`. */
    readonly verifiedName?: WaVerifiedNameResult
    /** Set on `product_update`. */
    readonly productIds?: readonly string[]
    /** Set on `collection_update`. */
    readonly collections?: readonly WaBusinessCollectionUpdate[]
    /** Set on `subscriptions_update`. Empty array when the stanza only carries feature flags. */
    readonly subscriptions?: readonly WaBusinessSubscription[]
    /** Set on `subscriptions_update`. Empty array when the stanza only carries subscriptions. */
    readonly featureFlags?: readonly WaBusinessFeatureFlag[]
}

export type WaPictureEventAction = 'set' | 'delete' | 'request' | 'set_avatar'

export interface WaPictureEvent extends WaIncomingBaseEvent {
    readonly action: WaPictureEventAction
    /** Entity whose picture changed (contact, group, community). */
    readonly targetJid?: string
    /** Actor that performed the change, when distinct from `targetJid`. */
    readonly authorJid?: string
    readonly timestampSeconds?: number
    /** Only populated on `action === 'set'`. Pass to the picture-fetch API to download the new bytes. */
    readonly pictureId?: number
    readonly contactHash?: string
}

export interface WaGroupEvent extends WaIncomingBaseEvent {
    /** Inner action node, kept for forward-compat parsing of fields the typed event does not expose. */
    readonly rawActionNode: BinaryNode
    /** Same value as `chatJid` – exposed under the group-specific name for clarity. */
    readonly groupJid?: string
    /** Actor that triggered the action (`participant` attr on the notification). */
    readonly authorJid?: string
    readonly timestampSeconds?: number
    readonly action: WaGroupEventAction
    /** Set on add / remove / promote / demote / invite. */
    readonly participants?: readonly WaGroupEventParticipant[]
    /** Set on `linked_group_*` / `link` / `unlink`. */
    readonly linkedGroups?: readonly WaGroupEventLinkedGroup[]
    /** Set on `created_membership_requests` / `revoked_membership_requests`. */
    readonly membershipRequests?: readonly WaGroupEventMembershipRequest[]
    /** Set on `created_sub_group_suggestion` / `revoked_sub_group_suggestions`. */
    readonly subgroupSuggestions?: readonly WaGroupEventSubgroupSuggestion[]
    readonly contextGroupJid?: string
    readonly requestMethod?: string
    /** Set on `subject`. */
    readonly subject?: string
    readonly subjectOwnerJid?: string
    /** Set on `description`. */
    readonly description?: string
    readonly descriptionId?: string
    /** Set on `invite` / `revoke_invite`. */
    readonly code?: string
    /** Set on `ephemeral`. */
    readonly expirationSeconds?: number
    readonly mode?: string
    readonly enabled?: boolean
    readonly reason?: string
    /** Decoded payload bag for actions without dedicated fields above. */
    readonly details?: Readonly<Record<string, unknown>>
}

export interface WaHistorySyncChunkEvent {
    /** Numeric value of `proto.Message.HistorySyncType` (`RECENT`, `ON_DEMAND`, …). */
    readonly syncType: number
    readonly messagesCount: number
    readonly conversationsCount: number
    readonly pushnamesCount: number
    readonly inlineContactsCount: number
    readonly chunkOrder?: number
    /** Server-reported progress, 0–100. */
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
          /** `true` for the first session after a fresh pair, `false` on resume. */
          readonly isNewLogin: boolean
      }
    | {
          readonly status: 'close'
          readonly reason: WaDisconnectReason
          /** `null` for client-initiated closes; populated when the server / transport emits one. */
          readonly code: WaConnectionCode | null
          /** `true` means the device was unlinked – do not reconnect, re-pair. */
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
     * a previous message. Fires unless `addons.autoDecrypt` is explicitly
     * set to `false`, and the parent message secret is available in the
     * `messageSecret` cache or the `messages` store.
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
     * One chunk of history-sync data, fired both during the initial
     * bootstrap that the primary device pushes after pairing and for any
     * on-demand backfill triggered by `message.requestHistorySync`.
     * Multiple chunks per sync; track `event.progress` for completion.
     * Skipped only when `history.enabled` is explicitly `false`.
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
    /** `0` on the terminal `'complete'` event. */
    readonly remainingStanzas: number
    /** `true` when triggered by an explicit catch-up request rather than auto-resume on reconnect. */
    readonly forced: boolean
}

export interface WaPrivacyTokenUpdateEvent {
    /** Peer whose trusted-contact-token (TC token) changed. */
    readonly jid: string
    readonly timestampS: number
    readonly type: string
    /** Live `'notification'` vs. backfill via `'history_sync'`. */
    readonly source: 'notification' | 'history_sync'
}
