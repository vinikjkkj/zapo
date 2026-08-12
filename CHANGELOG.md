# zapo-js

## 1.7.1

### Patch Changes

- Align the noise `ClientPayload` and the pairing flow with WhatsApp Web, field by field against the deobfuscated bundle and a live session. `UserAgent.osVersion` carries the literal `0.1` the web device-info bridge sends instead of the OS display name, `UserAgent.phoneId` is dropped (the web client never sends it, and a per-connect UUID is a fingerprint that changes on every connection), and `DeviceProps.version` carries the OS version rather than the app version already advertised in `UserAgent.appVersion` - non dotted-numeric versions leave it unset. `historySyncConfig` matches the web field set (`supportCallLogHistory`, `supportGroupHistory`, `thumbnailSyncDaysLimit`, `supportManusHistory`, `supportHatchHistory`, `supportedBotChannelFbids`; `supportInlineContacts` dropped), `pull` defaults to false on a registration handshake and true on a login, and `lc` / `connectAttemptCount` ride on login backed by a persisted `loginCounter` reset on pairing. The pairing-code flow re-runs when the primary replays `primary_hello` after a completed `companion_finish` (capped at 3 attempts, restarted from a fresh adv secret) instead of stalling, persists the derived adv secret before sending `companion_finish` so a lost response cannot leave the pair-success HMAC unverifiable, and anchors the 180s code lifetime at generation. `pair-success` answers `iq type=error` with `not-authorized` when the HMAC or the account signature fails instead of leaving the server without a response, ignores replays once a pairing is in flight or the session is registered, and enforces the 1-500 byte bound on the device-identity payload. Adds the `deviceOsVersion` client option for callers advertising an OS the process is not running on, so the advertised name and version stay a matching pair.
- Match the own account's hosted devices in `isOwnAccountJid`, so a stanza from one of them is no longer treated as coming from another account.
- Send `fetch_pinned_messages` on newsletter metadata queries, so pinned messages come back with the metadata instead of being missing.
- Keep the plugin event maps well-typed under `exactOptionalPropertyTypes`.
- Split poll creation between V1 and V3 by `selectableCount`, matching how WhatsApp Web picks the message version.
- Set the `native_flow` biz name for PIX and review-and-pay sends.
- Cut hot-path CPU and allocations across signal, codec, media and appstate: outbound attrs are built in a single pass, history sync chunks are decoded incrementally instead of materializing the whole graph, media encryption writes into a buffer that already reserves room for the mac, and the group send and jid paths drop redundant work.

## 1.7.0

### Minor Changes

- Send and receive the group history bundle a member shares with someone who joined a group late, in both directions. The receiver (`history.groupBundles`, off by default) verifies this account is listed in `historyReceivers` before spending a CDN fetch, drops stubs, foreign-chat entries and ephemeral-expired or over-age messages, persists the rest and emits `group_history_bundle`; out-of-window pins ride along exempt from the age cutoff, and the window limits come from the server-synced AB props rather than hardcoded defaults. The sender, `client.message.shareGroupHistory()`, resolves the requested members against the live participant list, uploads the zlib-compressed `GroupHistory` payload and restricts the per-device fanout to its receivers plus this account, so members who are not receiving it never see the bundle. Bundles derive their media keys from the `Group History` HKDF context, distinct from the `WhatsApp History Keys` used by history sync.
- Vendor the AB prop catalogue extracted from the WA Web bundle (2151 user props plus 14 group props) under `@abprops-spec`, replacing the hand-maintained 133-entry table. That table carried 21 config codes that no longer match the bundle (`group_size_limit`, `web_image_max_edge`, the `syncd_*` and `after_read_*` families among them), so those rows were dropped on every sync; against a live `abt` response the client now applies 830 of 1582 served props instead of at most 133. `parseConfigValue` gained a float branch for the six catalogued float props, and int values are decoded with `parseInt` like WA Web does, so a served negative no longer loses to the default (eleven props ship `-1` as their own default). The previous surface stays exported from `zapo-js/protocol`, deprecated: `AB_PROP_CONFIGS` is a compatibility view over `WA_ABPROPS` that keeps `configCode`, and `AbPropName` / `AbPropType` / `AbPropValue` alias their `Wa*` counterparts.
- Recover messages the server delivers as `<unavailable/>` through a placeholder resend. Those stanzas carry no `<enc>`, so they never reached the queue decrypt failures use and the payload was acked and dropped; a plain fanout placeholder is recoverable, because the primary still holds the plaintext and resends it on a `PLACEHOLDER_MESSAGE_RESEND` peer request. The unrecoverable flavours are derived from the stanza itself (`<bot>` child, `hosted=true`, `type=view_once`) instead of only `attrs.subtype`, the age window comes from `placeholder_message_resend_maximum_days_limit` instead of a hardcoded 30 days, and `message_unavailable` gains `resendRequested` so consumers know whether to expect a follow-up message event with the same key. The resend is not timed out at 30s: a real primary answered at ~30.6s, past the peer-request default, and the recovered message was discarded.
- Surface privacy changes made on the primary. The `account_sync` dirty bit refetched the settings and the blocklist and dropped both responses, and the live path (`<notification type="account_sync">`) was unmodelled, so it fell through to `debug_notification`. Both paths now run one refresh of the full category set plus the four disallowed lists, debounced by 1s so a burst of changes on the phone collapses into a single refetch, surfaced as one `privacy` event. Adds `setDisallowedList`, the missing write path for a deny-list, which carries the mode and the entries in one stanza and resolves a stale `dhash` (`409`) by refetching and retrying; `setPrivacySetting` now keeps the `dhash` the server echoes back, the stamp the next write needs. `buildGetPrivacyDisallowedListIq` omitted `addressing_mode="lid"`, so every read answered `400: bad-request` on a LID-migrated account, and `pix` and `linked_profiles` were dropped as unmodelled: both are real visibility categories, deny-list included.
- Resolve the per-chat disappearing settings from a new `chatMetadata` cache domain instead of the `threads` mailbox domain. `threads` defaults to `'none'`, so in the default configuration the lookup returned nothing and `contextInfo.ephemeralSettingTimestamp` was never stamped, leaving the peer warning that the message would not disappear; pointing `threads` at a persistent backend fixed the stamping but made the archive a send dependency. `chatMetadata` defaults to `'memory'`, mirroring `groupMetadata`: the send path reads the cache, falls back to the thread record on a cold miss and warms the cache with it, and degrades to "no ephemeral fields" when either lookup throws. Ordinary inbound traffic now refreshes the setting too, not just history sync and `EPHEMERAL_SETTING`, so a change made while offline no longer stays wrong until the next sync. Groups gain the disappearing-mode trigger the metadata query already parsed and threw away, so a group send carries the trigger the group reports rather than a fabricated one. `disableGroupEphemeralAutoInject` goes back to gating groups only, and 1:1 gets `disableDirectEphemeralAutoInject`.
- `WaStoreBackend<S, C>` takes optional parameters naming the domains a backend implements, so a backend no longer has to cover the whole matrix: a partial one writes `satisfies WaStoreBackend<'auth', never>`. `createStore()` infers the backend map instead of only the backend names, so routing an undeclared domain (or misspelling a backend name) fails to compile instead of throwing `does not provide <kind>.<domain>` on the first `session()`. Both parameters default to the full matrix, so a bare `WaStoreBackend` keeps meaning every domain: a hand-written full backend has to declare the new `chatMetadata` cache or narrow to `WaStoreBackend<S, C>`. The mandatory coverage of every persistence domain once a backend is registered is unchanged, and `'none'` still resolves to the noop store.
- Parse the `<ib><thread_metadata>` bulletin into a typed `offline_thread_metadata` event carrying the per-thread preview timestamps plus the optional read watermarks and delayed status/notification backlog counts. It announces which threads have queued traffic just before the server flushes the offline queue, but it was routed through the generic info-bulletin path, which only reads the child tag's own attrs: those are empty here, so every field came back null and the manifest was reachable only by walking `rawNode` by hand. The generic `debug_notification` mirror still fires, so existing listeners keep working. It cannot enrich `offline_resume` instead, because the manifest arrives after `offline_preview`, when the `resuming` event is already out.
- Add an optional Rust-backed crypto backend, `@zapo-js/native`, for the messaging hot path: XEdDSA sign/verify (avoiding the WebCrypto Ed25519 round-trip that dominates SKDM sign in fanout) and X25519 ECDH scalar mult (avoiding the `createPrivateKey` / `createPublicKey` DER round-trip in `node:crypto.diffieHellman`). The binding is try-required at module load and falls back to the JS implementation when missing, so consumers without the prebuilt binary are unaffected. `ZAPO_XEDDSA_FORCE_JS` and `ZAPO_X25519_FORCE_JS` force the JS path.

### Patch Changes

- Stamp `ephemeralSettingTimestamp` on outgoing ephemeral messages for both 1:1 and group chats. The TTL comes from the group metadata cache or the thread store expiration, the setting timestamp from the thread store, and explicit `expirationSeconds` / `ephemeralSettingTimestamp` / `disappearingModeTrigger` send options now win over the auto-inject instead of being spread over and discarded. The recipient LID is resolved before the lookup, which is keyed by the LID form: a send addressed by phone jid previously got no `expiration`, no `ephemeralSettingTimestamp` and no `disappearingMode` while the same chat addressed by LID got all three. 1:1 sends emit `initiator: CHANGED_IN_CHAT` alongside the trigger, the shape wa-web produces for a DM.
- Resolve a newsletter publish `mediatype` with the shared enc-media resolver instead of a local duplicate that only knew uploadable media. An `extendedTextMessage` carrying a link preview went out as `type=text` with a bare `<plaintext>` node, so the channel dropped the preview card and rendered plain text; it now goes out as `type=media` + `mediatype=url`. Contact cards (`vcard`) were missing for the same reason. The link preview resolver is also wired into the channel text path, where it was silently dropped so `{ type: 'text', linkPreview }` never produced a card: channel media is not encrypted, so the HQ thumbnail uploads in the clear and carries `thumbnailDirectPath` plus a plaintext `thumbnailSha256`.

## 1.6.2

### Patch Changes

- Fix a store session being unusable after `destroy()`: the destroyed bundle stayed cached in the `createStore` session map, so a new client built for the same `sessionId` in the same process got a bundle whose gates were permanently closed and every store op rejected with `shared-exclusive gate is closed` (first visible on group sends, through the deviceList/groupMetadata/senderKey lookups). `destroy()` now evicts the bundle - guarded so a late destroy on a stale reference cannot drop a newer one - and `destroyCaches()` swaps in freshly built cache stores instead of closing them for good, with the bundle exposing cache domains through getters so recreated clients pick up the new stores. Concurrent resets are serialized and the fresh caches are swapped in only after the previous generation finishes tearing down, so clearing a persistent cache backend cannot race writes to the new stores. Teardown batches now use `allSettled` with a single aggregated warning, so one failing `clear()` can no longer skip the destroy batch and leak cache-store resources, and the deviceList cache honors its documented memory default instead of silently resolving to the noop store when `cacheProviders` is unset (which forced a usync round-trip on every send). The lifecycle semantics are documented on `WaStoreSession` / `WaStore`.

## 1.6.1

### Patch Changes

- Fix blocklist block/unblock for LID-migrated accounts: the server keys blocklist entries by LID and rejected the legacy single-jid block item with `400: bad-request`. Block now addresses the LID jid plus an identifier attribute (`pn_jid` when known, `unknown_identifier` otherwise), unblock sends the LID when one exists, and non-migrated targets keep the plain phone-jid form. `blockUser`/`unblockUser` accept a phone jid, LID jid, or bare number, resolving the missing addressing form cache-first via the device-list store with a one-shot usync fallback; the canonical usync phone jid is used as `pn_jid`, covering server number corrections like the BR 9th digit.
- Fix keepalive dead-socket detection being starved by pending queries: on a zombie socket writes succeed but responses never arrive, so a busy session always had pending queries and the dead-socket ping never ran, leaving the connection stuck timing out every query. The keepalive now tracks the last raw inbound payload timestamp and only skips the ping while pending queries are backed by recent inbound activity; a socket silent past `deadSocketTimeoutMs` is pinged even with queries pending, and on ping failure pending queries are rejected before the socket resumes so callers fail fast.

## 1.6.0

### Minor Changes

- Add a session-bound `client.message.upload(source, options)` that encrypts and uploads standalone media to the WhatsApp CDN and returns the reusable descriptor (`url`, `directPath`, `mediaKey`, file hashes, sidecars, `mediaKeyTimestamp`) without sending a message. Internally a shared `uploadMedia()` primitive backs the media send path, sticker-pack upload, and the new method so they share one encrypt/conn/upload/parse flow; bytes take a zero-temp-file fast path while streams stage to a temp file. Unknown upload types are rejected up front before encrypting. `WaMediaCrypto` and `WaMediaTransferClient` (plus their result and option types) are re-exported from the package root, making media encryption/decryption usable standalone and fixing `WaDownloadMediaMessageOptions.transfer` referencing a previously unexported type.

## 1.5.1

### Patch Changes

- Correlate LID usync responses by the queried value / `<contact>` echo instead of string-matching the returned `<user jid>`. A server number-correction (e.g. BR 9th digit) now resolves as existing and its LID is used on send instead of falling back to PN, and a rejected/invalid number is recovered and flagged instead of throwing away the whole batch. `SignalLidSyncResult` gains `queriedJid` and `invalid`.
- Fix the StatusPrivacy mutation write against the renamed proto fields (`shareToFB`→`shareToFb`, `shareToIG`→`shareToIg`); the old spread keys were silently wrong, so sharing status to Facebook/Instagram was dropped.
- Refresh the advertised WA Web version to `2.3000.1043028647` and re-vendor the proto/mex/appstate spec (brings in the PQXDH kyber prekey fields).

## 1.5.0

### Minor Changes

- Add `client.mobile` (`WaMobileCoordinator`): a mobile-primary session can link, host, and revoke its own companion devices, the inverse of zapo's usual companion role. It signs and uploads the companion's `ADVSignedDeviceIdentity` and key-index list, keeps the companion past its ~180s bootstrap by satisfying the client-props LID migration, `INITIAL_BOOTSTRAP` history-sync, and seeded `setting_pushName` gates, revokes one device or every companion in a single `remove-companion-device` stanza, reconciles the hosted set against the server device list on connect and `account_sync`, and shares the app-state sync keys so the companion decrypts collections. Guarded to mobile-primary sessions; companion sessions get a clear error from `client.mobile`.
- Unify the web and mobile version fetchers into a single `wa-version-fetcher` and add `fetchLatestWaMobileVersion`, which scrapes the current WhatsApp for Android release (the official page only exposes a stale minimum-requirement version). `recoverFromClientTooOld` now handles mobile sessions by refreshing the Android app version into `deviceInfo.appVersion` for the next connect, the `version` option is honored per transport and validated (mobile requires exactly 4 numeric parts, web accepts 3 to 5), and the web noise payload advertises the 4th and 5th version parts when a longer version is supplied.
- Add the opt-in `chatEvents.emitLocalMutations` option (default off): when enabled, every app-state action this client sends (mute, pin, archive, read, ...) emits a `mutation` event with `source: 'local'` at action time, so consumers can observe their own changes without waiting for the server to echo them back as a `patch`. Purely additive; default behavior is unchanged.
- Expose `resolveWaDeviceIdentity`, `getWaBrowserDisplayName`, and `WA_VERSION` from the public barrels (plus `delay` from `zapo-js/util`), so plugins and downstream code can build a client payload that agrees with the pairing device identity. Consumed by `@zapo-js/wam`.

### Patch Changes

- Reinstall client plugins after a disconnect/reconnect cycle: `disconnect()` disposed the plugins and `connect()` never reinstalled them, so a reconnected session silently lost every plugin and each `client.<exposeAs>` accessor. Plugins are now reinstalled when the session reconnects.

## 1.4.0

### Minor Changes

- Add the companion side of WhatsApp's "Shortcake" (CRSC) passkey device-linking handshake, which the server can force right after a pairing-code `companion_finish`. Drives the `passkey_prologue_request` + `crsc_continuation` exchange, derives a pairing handoff proof from the ADV secret (rotating it) so the server can skip the code-matching UX, and auto-confirms headless. The WebAuthn assertion is the only external input via the new `signPasskeyAssertion` option (`WaShortcakeAssertionSigner` is exported for typing it), and a typed `auth_passkey_required` event fires when the server pushes the prologue. Previously such a prologue fell through the link-code handler and stalled the link.

### Patch Changes

- Resend a group `pkmsg` retry without the device-identity node on a mobile primary (device 0), which has no self-signed device-identity, instead of dropping the resend as ineligible. The missing-identity warn is now scoped to companion sessions where the absence is actually anomalous.

## 1.3.0

### Minor Changes

- Add a `WaClient` plugin system via `defineWaClientPlugin`: a plugin either runs setup side effects or exposes an API at `client[exposeAs]`, with the accessor type and its events inferred from the plugin definition. Powers `@zapo-js/voip`.

## 1.2.1

### Patch Changes

- Tolerate a poisoned (server-side LT-hash inconsistent) collection snapshot MAC: warn and continue with the partial state so the version advances instead of throwing into an endless refetch loop that re-requests the same unverifiable snapshot forever.

## 1.2.0

### Minor Changes

- Emit a typed `message_unavailable` event when an incoming message is an unavailable placeholder, so consumers can handle it explicitly instead of inferring it from a missing body.
- Add the opt-in `addons.persistAllSecrets` option to persist the message secret of every sent and received message (not just polls, events, and bot prompts), so encrypted addons whose parent can be any message type (reactions, comments, edits) stay decryptable after a restart without archiving full message bodies.

### Patch Changes

- Stamp `peer_recipient_pn` on LID-addressed 1:1 sends so the cross-reference matches wa-web.

## 1.1.3

### Patch Changes

- Attach the trusted-contact (privacy) token to presence-subscribe, profile-picture get, and about/status usync queries, not just message send, matching wa-web so privacy-gated reads against a trusted contact are accepted instead of going out tokenless.
- Resolve `fromMe` and the chat jid for a 1:1 message authored by another of your own devices, instead of surfacing it as inbound from yourself with the wrong `remoteJid`.
- Key own-account self traffic (msg/skmsg from your own primary) onto a single LID Signal session so it decrypts directly, instead of failing on an incomplete LID fork and recovering only via the slow placeholder/PDO round-trip.
- Map the signal "invalid message mac" error to the bad-MAC retry reason; the previous "invalid mac" match missed it (the word "message" sits in between), so bad-MAC retries went out with `error=0`.
- Always emit the `error` attribute on the `<retry>` receipt (defaulting to 0) and map the "message too far in future" signal variant to the future-message retry reason.
- Drop the noisy `clear-pending` warn on a disconnect with no in-flight query, and lower the remaining log to debug.
- Build via the `prepare` lifecycle hook instead of `prepack`, so installing `zapo-js` straight from a git URL ships a built `dist/` (npm runs `prepare`, not `prepack`, for git dependencies).

## 1.1.2

### Patch Changes

- Skip placeholder-message resend on a mobile-primary session and fall back to plain retry receipts, since a primary phone has no peer device to ask for the original plaintext.
- Apply local `pushName` changes immediately and route the app-state echo, so a self-initiated display-name update reflects locally without waiting for the server round-trip.
- Derive mobile-primary mode from persisted `deviceInfo` so a registered mobile session reconnects fully in mobile mode (id formats, app-state primary gating, placeholder-resend withholding) without re-passing `{ mobileTransport }` on every construction.
- Treat the mobile primary as authoritative for app-state and resolve sync conflicts in its favor, preventing a server snapshot from overwriting local primary state.
- Carry the trusted-contact (privacy) token on retry resends so privacy-gated recipients accept the resend instead of nacking it with error 463.
- Send raw 32-byte public keys (not version-prefixed) in the retry keys section, matching wa-web so the peer can rebuild the session from a retry receipt.
- Defer decrypt-failure handling to a bounded queue and ack undecryptable stanzas, preventing inbound-pipeline stalls and stopping redelivery loops on the give-up path.
- Skip undecodable previous Signal sessions during the decrypt fallback instead of aborting, so a corrupt prior session no longer blocks decryption with a still-valid one.
- Resolve the self-author participant on recovered group events, fixing author attribution when a group message is recovered via placeholder resend.
- Gate the noise IK resume on registered sessions so a freshly-paired/unregistered session does not attempt an invalid identity-key resume.

## 1.1.1

### Patch Changes

- Strip the `:device` segment from incoming 1:1 `key.remoteJid` so it carries the deviceless chat identity; the device stays exposed via `senderDevice`.
- Assert the IQ result on the companion hello during pairing so server-side errors surface instead of being swallowed.
- Omit `recipient` from group decrypt-failure retry receipts (wa-web only sets it for 1:1 peer messages), so the server resends instead of going silent.
- Ack `hist_sync` chunks even when history sync is disabled, matching wa-web which always acks.
- Strip the `:device` segment from the `ignoreKey` predicate context so a predicate comparing against a deviceless JID also matches device-suffixed stanzas.
- Prevent a stopped comms from being resurrected by a stale keepalive resume, which left an orphan socket reconnecting forever until process restart.

## 1.1.0

### Minor Changes

- Add a standalone `downloadMediaMessage(source, options)` helper that resolves a message's encrypted media payload and streams it from the WhatsApp CDN without a connected `WaClient`, with a per-call proxy option; also export `resolveMediaPayload` and `WaResolvedMediaPayload` for standalone media-key extraction.
- Surface every id from batch `<list>` read/delivery receipts as `WaIncomingReceiptEvent.messageIds`, instead of dropping all but the top-level id.

### Patch Changes

- Emit quote `contextInfo.remoteJid` only for cross-chat quotes and clear an inherited value on a same-chat reply, matching wa-web so a 1:1 reply is not treated as a cross-chat reference.
- Read top-level `fromMe` from `WaMessageKey` quotes, so quoting a self-sent DM resolves to the correct participant instead of the peer.
- Resolve the vendored spec bridges in the emitted `.d.ts` types and the ESM build, fixing `TS2307` on the published types and a runtime "Cannot find module" on `import 'zapo-js'` under ESM that shipped in 1.0.1.

## 1.0.1

### Patch Changes

- Keep credentials on a forced-login stream error instead of clearing them, so the next connect can recover the existing session.
- Order the group-event cache mutation before the event emit and store the canonical participant, so listeners observe consistent cached metadata.
- Stop `getOrGenPreKeys` from spinning when generated pre-key ids collide with already-stored ids.
- Send the E.164-prefixed contact in the device-sync usync query.
- Use a 100px max edge when generating image and video thumbnails.
- Resolve tsc-alias path mapping by pointing every `tsconfig.json` alias at its parent directory instead of an entry file, so emitted `.d.ts` files no longer contain unresolved `@module` / `zapo-js/*` import specifiers.

## 1.0.0

### Major Changes

First stable release. The public API is now frozen under SemVer: from `1.0.0`, breaking changes ship only in a major bump.

- `WaClient` surface split into coordinator namespaces (`client.message`, `client.group`, `client.profile`, `client.privacy`, ...); send method names unified across coordinators.
- `WaClientEventMap` regrouped and receipt status typed; newsletter per-message updates unified into a single `newsletter_message_update` event.
- Message addressing consolidated into a proto-aligned `key` (no remapping adapters); DMs sent in LID form for retry eligibility.
- `createStore` now requires explicit `providers` when `backends` is set; default `providers.auth` moved to the in-memory `WaAuthMemoryStore`.
- Three opinionated client defaults flipped; group result parsers typed; `getLidsByPhoneNumbers` moved to the profile coordinator.
- `additionalAttributes` supported on the `<message />` stanza.
- Client dependency wiring, store contracts, and session resolution consolidated (breaking for custom store and session integrations).
- Channels (newsletter), communities (parent groups), full group metadata, and membership-approval methods.
- Business surface: interactive/list/button messages, business notifications, cover-photo upload, typed business hours.
- Bot coordinator (Meta AI and other WhatsApp bots), presence/chatstate, typed `sendReceipt` with auto-aggregation, `contextInfo` (quote/forward/mentions), link previews, status/broadcast.
- Hosted-device support, peer-message wire-format parity, placeholder resend PDO fallback, clock-skew resync on keepalive.
- Store: opt-in read-through `cacheLayer` for hot signal domains, batched write-behind persistence across sqlite/mysql/postgres/redis/mongo.
- Structured logging overhaul; dual ESM/CJS builds for all optional packages.
- Performance: `node:crypto` migration, sync crypto primitives with thread-pool DH, single-pass packed-string encoder, reduced hot-path allocations.

## 0.3.0

### Minor Changes

- Mobile-flow surface: WhatsApp Android primary runtime, MEX/Pando GraphQL client with
  custom argo decoder, mobile device fingerprint persisted with credentials, custom
  pairing code support, mobile-flow registration notifications (registration code + account
  takeover), and email registration coordinator over `urn:xmpp:whatsapp:account`
  (`client.email.*`).

- New coordinators and stores: `WaAbPropsCoordinator` with in-memory cache and protocol
  sync, `WaOfflineResumeCoordinator` with presence support and incoming node improvements,
  `WaMessageSecretStore` cache for addon/event/poll secret persistence, addon auto-decrypt
  with `message_addon` event and poll option resolution, user-initiated logout via
  remove-companion-device IQ, dangerous escape-hatch options for security checks.

- Performance: reduce allocation hotspots in signal decode, incoming messages and store
  locks; pre-import crypto keys at derivation time and remove key share coordinator;
  optimize JID/phash parsing and canonicalization in hot paths; memoize locale resolution.

- Fixes: correct offline resume semantics and drop batch loop; normalize prekey pub keys
  to raw 32 bytes on wire and on digest compare; route encrypt/dirty/status iqs through
  mobile system id pool; X25519 scalarMult fallback for Bun runtime; harden store backends
  with TTL validation, bounds, and chunked deletes; remove unnecessary `toBytesView` calls
  and fix store provider defaults and backend lifecycle; set `to` attr and normalize jid
  in privacy-token IQ builder.

- Refactors: split `WaSignalStore` into `signal`, `preKey`, `session`, and `identity`
  stores (breaking for custom store implementations); extract `XEdDSA` sign/verify into
  `@crypto/core/xeddsa`; rename `WaAppStateSyncResponseParser` to `response-parser`;
  drop unused `@transport/node/builders` barrel; consolidate inline type imports and
  enforce alphabetical order of named import members.

- New packages: `@zapo-js/fake-server` (fake WhatsApp Web server for end-to-end testing,
  first publish) and `@zapo-js/media-utils` (ffmpeg/sharp processing and media message
  support).

## 0.1.2

### Patch Changes

- Release 0.1.2 with protocol/client refactors, hot-path performance improvements, and
  reliability updates across message dispatch, sender-key distribution, app-state, and store
  batching flows.

## 0.1.1

### Patch Changes

- Consolidated release after `v0.1.0`:
    - add SQLite custom table-name support with improved table resolution
    - bundle protobuf runtime into generated proto output, removing mandatory runtime dependencies
    - centralize usync builders and sid generation for cleaner protocol flow internals
    - refresh README and project tooling/docs consistency updates
