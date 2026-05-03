# zapo-js

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
