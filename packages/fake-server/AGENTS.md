# AGENTS.md — `@zapo-js/fake-server`

> A fake WhatsApp Web server used to test `zapo-js` end-to-end.
> Behavioral parity with WhatsApp Web is derived from `/deobfuscated`, **not** from the `zapo-js` client implementation.

---

## 1. Mission

This package implements just enough of the WhatsApp Web server side to drive the `zapo-js` client through real protocol flows in tests:

- WebSocket listener
- Noise XX handshake (server side)
- Binary stanza transport
- Auth / pairing
- IQ routing
- Push notifications (messages, group events, identity changes, receipts)
- Stream lifecycle (success, dirty, errors)

Tests written against this server validate the **client** against the **protocol**, not against the lib's own interpretation of itself.

### What this is NOT

- Not a passthrough proxy to real WhatsApp servers
- Not a record/replay system
- Not a mock with stubbed responses (that's a thinner abstraction; this is a real protocol implementation)
- Not a substitute for `*.flow.test.ts` against real WhatsApp when validating new protocol features — it's a tool for **regression**, not for **discovery**

---

## 2. The Non-Tautology Principle

**The most important rule.** Keep it pinned at the top of every PR review.

If both sides of a test (client + server) come from the same source, the test only proves the source is internally consistent — not that it matches reality. To avoid that trap:

1. **Server behavior is derived from `/deobfuscated`**, the WhatsApp Web source of truth at the repo root.
2. **The server may not import `zapo-js` symbols that encode behavior** — only transport-layer primitives (Layer 1, see below).
3. **When in doubt about a flow, open `/deobfuscated`, not `src/`.** If a `/deobfuscated` file does not answer the question, capture a real session — not the lib code.

A handler in `protocol/` that fails this rule is broken even if its tests pass.

---

## 3. Layered Architecture

```
┌─ Layer 1: transport primitives ────────────────────┐
│  May import zapo-js (binary codec, protos, crypto) │
│  Bit-exact, no behavior, no interpretation         │
└────────────────────────────────────────────────────┘
                       ▲
                       │
┌─ Layer 2: protocol behavior ───────────────────────┐
│  Derived from /deobfuscated                        │
│  May import ONLY from Layer 1                      │
│  Forbidden: any import of zapo-js (direct or *)    │
└────────────────────────────────────────────────────┘
                       ▲
                       │
┌─ Layer 3: test API (scenarios, assertions) ────────┐
│  May import from Layer 1 and Layer 2               │
│  Forbidden: zapo-js (except types in test fixtures)│
└────────────────────────────────────────────────────┘
```

### Layer 1 — `src/transport/`

The **only** place that may import from `zapo-js`. Thin wrappers that re-export:

| File | Re-exports |
| --- | --- |
| `transport/codec.ts` | `encodeBinaryNode`, `decodeBinaryNode`, `BinaryNode` (`zapo-js/transport`) |
| `transport/crypto.ts` | `sha256`, `hkdf`, `aesGcm*`, `X25519`, `Ed25519`, `randomBytesAsync` (`zapo-js/crypto`) |
| `transport/protos.ts` | `proto`, `Proto` namespace (`zapo-js/proto`) |
| `transport/noise-frame.ts` | Noise framing primitives (`zapo-js/transport`) — framing only, **not** the handshake state machine |

If you need a primitive that is not in this list, add it explicitly here. **Do not** sneak `zapo-js` imports into other layers.

### Layer 2 — `src/infra/`, `src/protocol/`, `src/state/`

- `infra/` — server runtime (WebSocket listener, connection state machine, noise handshake server-side)
- `protocol/` — pairing, auth, IQ handlers, push, stream — every file derived from `/deobfuscated`
- `state/` — fake server's mutable state (registered devices, prekeys, groups, pending messages)

### Layer 3 — `src/api/`

- `FakeWaServer.ts` — entry point: `start()`, `stop()`, `scenario()`, `expectIq()`, `pushMessage()`
- `Scenario.ts` — fluent builder for scripted server behavior
- `Expectation.ts` / `Assertion.ts` — helpers for asserting what the client sent

---

## 4. File Header Convention

Every file in `src/protocol/**` MUST start with a provenance header:

```ts
/**
 * Mirrors WhatsApp Web companion unpair flow.
 *
 * Source: /deobfuscated/WAWebUnpairDeviceJob.js
 *
 * Stanza shape:
 *   <iq type="set" xmlns="md">
 *     <remove-companion-device jid="..." reason="..."/>
 *   </iq>
 */
```

Three required parts:

1. One-line summary of the flow.
2. `Source:` line pointing at one or more `/deobfuscated/*.js` files.
3. The exact stanza shape (or notification shape) being implemented.

Files in `infra/` and `state/` get a normal doc comment without the `Source:` line — they are server scaffolding, not protocol mirrors.

---

## 5. Lint Firewall

The non-tautology rule is enforced by an ESLint override in this package's eslint config (or the repo root):

```js
{
    files: [
        'packages/fake-server/src/infra/**/*.ts',
        'packages/fake-server/src/protocol/**/*.ts',
        'packages/fake-server/src/state/**/*.ts',
        'packages/fake-server/src/api/**/*.ts'
    ],
    rules: {
        'no-restricted-imports': ['error', {
            patterns: [{
                group: ['zapo-js', 'zapo-js/*'],
                message:
                    'fake-server Layer 2/3 must not import zapo-js. ' +
                    'Add the primitive to src/transport/ and import from there.'
            }]
        }]
    }
}
```

A failing lint here means somebody breached the firewall — investigate before silencing.

---

## 6. Code Conventions

Inherits the root `AGENTS.md` rules (4 spaces, single quotes, no semicolons, named exports only, `Uint8Array` only, etc.) with these additions:

### 6.1 Naming

| Category | Convention |
| --- | --- |
| Server runtime classes | `WaFake*` prefix (`WaFakeWsServer`, `WaFakeNoiseHandshake`, `WaFakeConnection`) |
| Protocol response builders | verb-first (`buildSuccessNode`, `buildPairDeviceSign`) |
| IQ handlers | `handle<Domain>Iq` (`handleUsyncIq`, `handleUnpairDeviceIq`) |
| Push builders | `buildIncomingMessage`, `buildGroupNotification`, etc. |
| Test API | unprefixed, ergonomic (`FakeWaServer`, `Scenario`, `expectIq`) |

### 6.2 State

- Per-connection state lives in `WaFakeConnection`. Connection state is created on `accept` and destroyed on close.
- Cross-connection state (paired devices, prekey store, group registry) lives in `state/` as singletons owned by `FakeWaServer`.
- **Never** leak state between test runs. `FakeWaServer.start()` always creates fresh state.

### 6.3 Determinism

- The server must be deterministic given a fixed scenario script and a fixed RNG seed.
- All randomness (nonces, IDs, timestamps) goes through a seedable source declared in `infra/`. **Never** call `Math.random()` or `Date.now()` directly inside `protocol/` — pass them in from `infra/`.

### 6.4 No `console.log`

Use a logger injected at server construction. Default: silent. Tests opt in via `FakeWaServer.start({ logger: testLogger })`.

---

## 7. Phasing

The package is built in phases. Each phase ends with a tagged release.

| Phase | Scope | Done when | Status |
| --- | --- | --- | --- |
| **1 — Bring-up** | WS listener + noise handshake + minimal auth response + 1 push | A `zapo-js` client can `connect()` against the fake server and receive a single message | ✅ done |
| **2 — IQ router** | All IQs the client sends during normal startup (usync, prekeys, app-state, presence) | A `zapo-js` client reaches `connection_open` without any unhandled IQ | ✅ done — see note below |
| **3 — Test API** | `FakeWaServer.scenario()`, `expectIq`, `capturedStanzaSnapshot`, `afterAuth` | Test files use the declarative `scenario(...)` builder instead of poking `registerIqHandler` directly | ✅ done |
| **4 — Negative paths** | Stream errors (515, 516, replaced, device-removed), IQ error codes, auth failure | Each error code has at least one regression test | ✅ done |
| **5 — Push coverage** | Group events, identity changes, presence, dirty bits, receipts, retries | Coverage matches `WaIncomingNodeCoordinator` dispatch table | ✅ done (attribute-based stanzas) |
| **6 — Test API ergonomics** | `expectStanza`, `broadcastStanza`, `waitForAuthenticatedPipeline`, `setRejectMode` | Tests can drive multi-step scenarios without poking internals | ✅ done |
| **7 — Resume / IK handshake** | Server-side noise IK so a `WaClient` reconnecting with a cached server static key can resume in a single round-trip | Sequential connect → disconnect → reconnect cross-check passes via IK without falling back to XX | ✅ done |
| **8 — Signal message exchange** | Server-side X3DH + send chain so a fake peer can encrypt a message the real lib decrypts and emits as `message` | Cross-check pushes a `<message><enc type="pkmsg"/>` and the lib's `message` event carries the decoded `proto.IMessage` | ✅ done (1:1 conversation) |
| **9 — Group SenderKey messages** | Server-side group SenderKey state + SKDM bootstrap so a fake peer can send a group `<enc type="skmsg"/>` the lib decrypts and emits as a group `message` | Cross-check pushes `<message from="<group>" participant="<peer>">` with `<enc type="pkmsg">` (SKDM) followed by `<enc type="skmsg">`, and the lib emits `message` with `chatJid=group`, `senderJid=peer`, `isGroupChat=true`, decoded `proto.IMessage` | ✅ done |
| **10 — QR pairing flow** | Server-side QR pairing: `<pair-device>` IQ with random refs + `<pair-success>` IQ carrying a real `ADVSignedDeviceIdentityHMAC` signed by an ephemeral fake primary device | Cross-check connects a fresh `WaClient`, the test extracts the `advSecretKey` + identity pubkey from the lib's `auth_qr` event, the fake server signs and sends `pair-success`, the lib verifies HMAC + account signature and emits `auth_paired` with `meJid` populated | ✅ done |
| **11 — Outbound `client.sendMessage`** | usync devices IQ handler + prekey-fetch IQ handler + per-`FakePeer` signed prekey bundle + auto-ack of outbound `<message>` stanzas | A paired client calls `client.sendMessage(peer, { extendedTextMessage })`, the lib resolves the peer via usync, fetches its prekey bundle, runs X3DH, encrypts and pushes a `<message>` stanza targeting the peer JID. Test asserts the captured stanza has the right `to` and contains an `<enc type="pkmsg|msg"/>` child | ✅ done |
| **12 — Decrypt outbound 1:1 messages on the fake peer** | `FakePeerRecvSession` implementing the X3DH responder + first Double Ratchet step + per-message AES-CBC/HMAC verify; `FakePeer.expectMessage` subscribes to inbound `<message to=peer-jid>` stanzas and returns the decoded `proto.Message` | Cross-check pairs a real client, calls `client.sendMessage(peer, { conversation })`, and the fake peer's `expectMessage` resolves with the matching plaintext for both the first `pkmsg` and the follow-up message in the same chain | ✅ done |
| **13 — Decrypt outbound group `<skmsg>` on the fake peer** | `FakePeerGroupRecvSession` implementing `WhisperGroup` chain-key derivation, XEdDSA signature verification on the `SenderKeyMessage` envelope, and AES-CBC payload decrypt; `FakePeer.expectGroupMessage` walks the per-recipient bootstrap pkmsg via the 1:1 recv session to extract the SKDM, then decrypts the top-level `<enc type=skmsg>` payload | Cross-check pairs a real client, registers a minimal `w:g2` group-metadata IQ handler so the lib's participants resolution succeeds, calls `client.sendMessage(group, { conversation })`, and the fake peer's `expectGroupMessage` resolves with the decoded plaintext | ✅ done |
| **14 — History sync push** | `FakePeer.sendHistorySync({ conversations, pushnames, ... })` builds a `proto.IMessage` carrying a `protocolMessage.historySyncNotification` whose `initialHistBootstrapInlinePayload` is the zlib-compressed `HistorySync` proto, then encrypts and pushes it via the existing 1:1 send path | Cross-check pushes a history-sync chunk with two conversations + one message + one pushname; the lib enables `history.enabled`, `processHistorySyncNotification` decompresses + persists, and emits `history_sync_chunk` with `conversationsCount=2 / messagesCount=1 / pushnamesCount=1` | ✅ done |
| **15 — App-state sync round-trip** | Auto-registered `xmlns="w:sync:app:state"` IQ handler echoing each requested `<collection/>` back as an empty `type="result"` (no patches, no snapshot — just enough to mark each collection as initialised at the supplied version); `FakeWaServer.pushServerSyncNotification(pipeline, { collections })` for the `<notification type="server_sync"/>` trigger | Cross-check connects, pushes a `server_sync` notification listing two collections, the lib reacts by sending the sync IQ for all five default collections, the auto handler responds with empty success, and `client.syncAppState()` resolves cleanly | ✅ done |
| **16 — Full app-state sync (real encrypted patches)** | `FakeAppStateCrypto` mirrors the lib's mutation/value/snapshot/patch HMAC pipeline + LTHash transition (HKDF labels `WhatsApp Mutation Keys` + `WhatsApp Patch Integrity`); `FakeAppStateCollection` tracks per-collection version + LTHash + indexValue map and emits encoded `SyncdPatch` blobs; `FakeWaServer.provideAppStateCollection(name, provider)` plugs payloads into the auto IQ handler; `FakePeer.sendAppStateSyncKeyShare` ships the sync key inside an encrypted `protocolMessage.appStateSyncKeyShare` | Cross-check mints a fresh sync key, applies a chat MUTE mutation to a `FakeAppStateCollection`, registers the resulting inline `<patches><patch>` payload, sends the key share via the fake peer, the lib auto-imports the key + auto-syncs, decrypts the patch via its real `WaAppStateCrypto`, applies it, and emits a `chat_event` with `action='mute'` matching the input | ✅ done |
| **17 — Media downloads via the fake HTTP listener** | `WaFakeWsServer` accepts an HTTP request handler alongside the websocket upgrade path; `FakeMediaStore` encrypts plaintext via the lib's real `WaMediaCrypto.encryptBytes` and serves the resulting ciphertext keyed by a random URL path; `FakeWaServer.publishMediaBlob({ mediaType, plaintext })` returns the descriptor (path + mediaKey + sha-256s) and `FakeWaServer.mediaUrl(path)` builds the absolute `http://host:port/<path>` URL the lib downloads from; auto-registered `<iq xmlns="w:m" type="set"><media_conn/></iq>` handler returns the fake server's host:port for any flow that consults the media-host cache | Two cross-checks: (a) `history-sync-external` publishes a zlib-compressed `HistorySync` proto as a `history` blob, ships an external-blob `historySyncNotification`, the lib downloads + decrypts via real `WaMediaTransferClient`, decompresses and emits `history_sync_chunk` with the right counts; (b) `image-message` publishes random bytes as an `image` blob, ships an `imageMessage` proto with the absolute directPath, the lib emits the `message` event and the test calls `client.mediaTransfer.downloadAndDecrypt(...)` to round-trip the bytes byte-for-byte | ✅ done |

### Phase 5 note — push coverage scope

Done in this slice:

- `<presence/>` builder (`buildIncomingPresence`) covering available / unavailable + numeric/sentinel `last`. Cross-checked: lib emits `presence` event with `chatJid`.
- `<chatstate/>` builder (`buildChatstate`) covering composing (with optional `media="audio"`) and paused. Cross-checked: lib emits `chatstate` event.
- `<error/>` builder (`buildIncomingErrorStanza`) covering free-standing error stanzas. Cross-checked: lib emits `stanza_error` event.

Deferred (not blocking — same pattern, more recon needed for proto-heavy ones):

- `<message/>` push — requires building a Signal-encrypted protobuf payload, much heavier than the simple attribute-based stanzas above.
- `<receipt/>` push — needs the receipt type matrix from `/deobfuscated/WAWebHandle*Receipt*`.
- `<notification type="group"/>` and other `<notification/>` subtypes.
- `<call/>` push.
- `<failure/>` push (companion-side failures).

### Phase 4 note — what is and is not covered

Done:

- `<stream:error code="516"/>` — asserts the lib emits `connection { close, reason: 'stream_error_force_logout' }`.
- `<stream:error><conflict type="replaced"/></stream:error>` → `stream_error_replaced`.
- `<stream:error><conflict type="device_removed"/></stream:error>` → `stream_error_device_removed`.
- IQ error response (`buildIqError(..., { code: 401 })`) propagates to the lib API as a rejection — covered by the `privacy.getPrivacySettings` cross-check.
- Unit-level builders for all `<stream:error/>` variants documented in `/deobfuscated/WAWebHandleS/WAWebHandleStreamError.js`.

Deferred:

- `<stream:error code="515"/>` (force-login) — exercises a reconnect loop on the lib side that needs a "second connection" hook in the scenario API.
- Auth failure during the noise handshake — needs additional recon to know which lib reaction to assert against.

### Phase 3 note — Scenario API surface

The Phase 3 acceptance is the declarative `scenario(...)` builder. Test files
write:

```ts
const server = await FakeWaServer.start()
server.scenario((s) => {
    s.onIq({ xmlns: 'usync' }).respondWith(buildUsyncResult([...]))
    s.onIq({ xmlns: 'privacy' }).respondOnce(buildIqError(...))
    s.afterAuth(async (pipeline) => {
        await pipeline.sendStanza(buildIncomingMessage(...))
    })
})

// Drive the lib...
await client.connect()

// Inspect what the lib did:
const sent = await server.expectIq({ xmlns: 'usync' }, { timeoutMs: 1000 })
const all = server.capturedStanzaSnapshot()
```

Cross-check tests sharing boilerplate (in-memory auth store, fully-noop store
backend, lib client construction with `testHooks.noiseRootCa`) live in
`src/__tests__/helpers/`. The `*.cross-check.test.ts` lint exception extends
to `__tests__/helpers/**` so those helpers are allowed to import zapo-js
directly.

### Phase 2 note — empirical bring-up needs no IQ handlers

The capture cross-check (`post-success-capture.cross-check.test.ts`) showed that a fresh `WaClient` (no stored credentials, pairing flow) emits `connection { status: 'open' }` immediately after the `<success/>` stanza without sending **any** IQ for at least 5 seconds. The Phase 2 done criterion is therefore satisfied trivially in the pairing scenario.

The `WaFakeIqRouter` infrastructure was still built because:

- It is required for Phase 3 (scenarios) and Phase 4 (negative paths).
- Once we test the **resume / login** flow (client with stored credentials reconnecting), the post-success traffic will include usync, prekey upload, app-state sync etc., and those handlers will be needed.
- It is exposed via `FakeWaServer.registerIqHandler(matcher, responder)` and unit-tested in isolation.

---

## 8. Anti-Patterns

### Critical

- importing `zapo-js` from outside `src/transport/`
- copying logic from `src/client/`, `src/signal/`, `src/auth/` instead of from `/deobfuscated`
- using lib types that encode interpretation (`WaIncomingMessageEvent`, `WaConnectionEvent`) — they are the **client's** view, not the **protocol**
- calling `Math.random()` / `Date.now()` directly in `protocol/`
- shared state across `FakeWaServer.start()` calls

### Frequent review nits

- missing `Source:` header in `protocol/` files
- handler that responds with hardcoded bytes instead of reconstructing the stanza
- scenario builder methods that assume a single connection (must be per-connection-aware)
- assertions that match the lib's interpretation rather than the wire stanza

---

## 9. Testing the Test Server

This package has its own unit tests in `packages/fake-server/src/**/__tests__/`:

- **Layer 1 tests** — round-trip encode/decode, crypto smoke tests
- **Layer 2 tests** — handler-by-handler: feed a fake stanza, assert the response stanza shape
- **Layer 3 tests** — scenario builder semantics, expectation timeouts

Cross-validation against `zapo-js`:

- `packages/fake-server/src/__tests__/integration.test.ts` — runs `zapo-js`'s public client against `FakeWaServer.start()` and asserts the lifecycle reaches `connection_open`

---

## 10. Dependency Direction

```
                              api
                               │
                               ▼
              ┌──── protocol ───── infra
              │         │             │
              │         ▼             │
              │       state           │
              │                       │
              └────────┬──────────────┘
                       ▼
                  transport
                       │
                       ▼
                    zapo-js
```

`api` → `protocol` → `state` → `transport` → `zapo-js`
`api` → `infra` → `transport` → `zapo-js`

No upward edges. No edges from `protocol`/`state`/`infra`/`api` directly into `zapo-js` (only via `transport`).
