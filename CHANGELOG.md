# zapo-js

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
