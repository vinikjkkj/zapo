# @zapo-js/fake-server

In-process fake WhatsApp server that drives the real `zapo-js` `WaClient` end-to-end - full Noise XX/IK handshake, QR pairing, Signal Protocol (X3DH + Double Ratchet), SenderKey for groups, media upload/download over self-signed HTTPS, app-state sync - all without touching WhatsApp servers.

It serves both transports: companions over WebSocket, and phones over the
mobile TCP transport, including the companion-hosting side of a primary
(pair-device, key-index list, pairing-code handshake).

## Install

```bash
npm i -D @zapo-js/fake-server zapo-js
```

`zapo-js` is a peer dependency - the fake server reuses the core's binary codec, crypto, and protos. Everything below works from any project; nothing requires this monorepo.

## Quick start

```ts
import { FakeWaServer } from '@zapo-js/fake-server'
import { createStore, WaClient } from 'zapo-js'

const server = await FakeWaServer.start()
const client = new WaClient({
    store: createStore({
        providers: { auth: 'memory', signal: 'memory', senderKey: 'memory', appState: 'memory' }
    }),
    chatSocketUrls: [server.url],
    testHooks: { noiseRootCa: server.noiseRootCa },
    proxy: { mediaUpload: server.mediaProxyAgent, mediaDownload: server.mediaProxyAgent }
})

await client.connect()
const pipeline = await server.waitForAuthenticatedPipeline()
// ... pair, create peers, send messages
await server.stop()
```

## Architecture

```text
src/
├── api/                     # Public-facing API
│   ├── FakeWaServer.ts      # Main facade – WS/TCP servers, IQ router, registries, lifecycle
│   ├── FakePeer.ts          # Simulated WhatsApp peer – Signal crypto, send/recv, groups
│   ├── FakePairingDriver.ts # QR pairing flow orchestrator (server plays the primary)
│   ├── FakeMobilePrimary.ts # Registered mobile-primary credentials for a phone client
│   └── Scenario.ts          # Declarative test scenario DSL
├── protocol/                # Protocol-layer builders, parsers, crypto
│   ├── auth/                # Pairing, ADV identity, cert chain, client payload
│   ├── iq/                  # IQ stanza handlers (abprops, privacy, groups, profile, ...)
│   ├── push/                # Inbound stanza builders (message, notification, receipt, ...)
│   ├── signal/              # Signal Protocol impl (Double Ratchet, SenderKey, prekeys)
│   └── stream/              # Stream error builders
├── infra/                   # Transport infrastructure
│   ├── WaFakeWsServer.ts    # Raw WebSocket server (ws) – companion transport
│   ├── WaFakeTcpServer.ts   # Raw TCP server – mobile transport
│   ├── socket-adapters.ts   # Per-carrier socket adapters (WebSocket, TCP)
│   ├── WaFakeConnection.ts  # Per-connection, carrier-agnostic wrapper
│   ├── WaFakeConnectionPipeline.ts  # Noise handshake + authenticated frame transport
│   ├── WaFakeFrameSocket.ts # Length-prefixed framing layer
│   ├── WaFakeTransport.ts   # AES-GCM noise transport (post-handshake encrypt/decrypt)
│   └── WaFakeMediaHttpsServer.ts  # Self-signed HTTPS media up/download
├── state/                   # State stores
│   ├── fake-media-store.ts  # In-memory media blob store
│   └── fake-app-state-collection.ts  # App-state patch/snapshot provider
├── transport/               # Re-exports from zapo-js (codec, crypto, protos)
└── __tests__/               # Cross-check test suite
    └── helpers/             # Shared test utilities (zapo-client factory)

bench/
├── messaging.bench.ts       # 4-scenario messaging profiler (send/recv × 1:1/group)
├── server-process.ts        # Child-process entry for --separate-process mode
└── server-rpc.ts            # IPC client for the child-process server
```

## Core concepts

### FakeWaServer

Central facade. Manages the WS listener, noise handshake, IQ router, and all state registries.

Constructor options (`FakeWaServer.start({...})` / `new FakeWaServer({...})`):

```ts
const server = await FakeWaServer.start({
    host: '127.0.0.1', // default
    port: 5222, // default: random free port
    path: '/ws/chat', // default
    successNodeAttributes: {
        // stamped on every post-handshake <success/>
        lid: '5511999@lid',
        displayName: 'Fake Display'
    },
    defaultIqHandlers: false // start with an empty IQ router (default: true)
})
```

- **Peer registry** (`peerRegistry`): maps device JIDs → `FakePeer` instances. The global `usync` + `prekey-fetch` IQ handlers consult this.
- **Sessions**: state is grouped per session (see below). A single-client server uses one default session, and the `server.registries` / `server.expectIq(...)` / `server.preKeyDispenser` surface delegates straight to it.
- **Group registry** (`groupRegistry`): maps group JIDs → group metadata + participants. The `w:g2` handler serves it.
- **IQ router** (`WaFakeIqRouter`): first-match-wins stanza dispatcher with `{ xmlns, type, childTag }` matchers. ~27 global handlers registered in the constructor cover every IQ the lib emits during normal operation (disable them with `defaultIqHandlers: false`). `registerIqHandler(matcher, respond)` registers at high priority and shadows the defaults; a responder that returns `null` falls through to the next matching handler, so you can observe an IQ (capture, assert) and still let the default answer it.
- **Prekey dispenser**: hands out unique one-time prekeys from the lib's upload to FakePeers. Resets on each forced refill (`triggerPreKeyUpload({ force: true })`).
- **Listener fan-outs**: `onOutboundGroupOp`, `onOutboundPrivacySet`, `onOutboundBlocklistChange`, `onOutboundProfilePictureSet`, `onOutboundStatusSet`, `onLogout`, `onOutboundPrivacyTokenIssue`, `onOutboundDirtyBitsClear`.

### Sessions (multiple clients, one server)

By default every connection shares one session, so a single `WaClient` sees the whole `FakeWaServer` surface. To run **several clients against one server without them sharing any state**, pass a `sessionKey` resolver: each authenticated connection is bound to an isolated session keyed by the returned id. Sessions never share peers, groups, prekeys, app-state, or captured stanzas.

```ts
const server = await FakeWaServer.start({
    // Key each connection by its login username; pre-login (registration)
    // connections fall under one transient bucket.
    sessionKey: ({ clientPayload }) =>
        clientPayload.kind === 'login' ? String(clientPayload.username) : 'pending'
})

// After a client authenticates, reach its isolated state through the pipeline:
const session = server.sessionFor(pipeline) // FakeServerSession
await session.expectIq({ xmlns: 'passive', type: 'set' })
session.registries.peerRegistry // this client's peers only
session.preKeyDispenser.capturedPreKeyBundleSnapshot() // this client's prekeys

// Or address a session by id directly:
const alice = server.session('5511111111111')

// Peer creation routes to the connection's session automatically:
const peer = await server.createFakePeer({ jid: peerJid }, pipeline)
```

Notes:

- The resolver runs once per connection, right after authentication (so `clientPayload` is available). Connections that resolve to the same id reuse one session.
- `server.registerIqHandler(...)` applies to every session (present and future); `session.registerIqHandler(...)` scopes to one session.
- The media HTTPS store is process-global and shared across sessions; isolation covers peers/groups/prekeys/app-state/captures, not uploaded media blobs.
- QR pairing writes to the connection's session too, so pair clients **sequentially** when keying registration connections into a shared bucket.

### FakePeer

Simulated WhatsApp peer with real Signal Protocol crypto:

- **1:1 messaging**: `peer.sendConversation(text)` encrypts via Double Ratchet and pushes a `<message><enc type="pkmsg|msg"/></message>` stanza.
- **Group messaging**: `peer.sendGroupConversation(groupJid, text)` bootstraps a SenderKey chain, encrypts the SKDM via 1:1 session, and sends `<enc type="skmsg"/>`.
- **Receive**: `peer.expectMessage()` / `peer.expectGroupMessage()` capture and decrypt the lib's outbound stanzas.
- **X3DH**: each peer generates its own identity keypair, signed prekey, and one-time prekeys. The prekey dispenser ensures unique consumption.

### Pairing

`server.runPairing(pipeline, { deviceJid }, materialFn)` drives the full QR-pairing flow:

1. Sends `pair-device` IQ with random refs
2. Awaits the `advSecretKey` + `identityPublicKey` from the client's `auth_qr` event
3. Builds an `ADVSignedDeviceIdentityHMAC` with a fresh fake primary keypair
4. Pushes `pair-success` IQ

After pairing, the lib reconnects with IK handshake. Use `waitForNextAuthenticatedPipeline()` to capture the post-pair pipeline.

### Mobile transport (phone clients)

Start the server with `{ tcp: true }` to also listen for the WhatsApp Mobile
transport, which dials `tcp://host:port` instead of upgrading to a WebSocket.
Both listeners share one server identity, session model, and IQ router.

Registration happens out of band (against WhatsApp's HTTP endpoints), so a
phone session starts from credentials that already exist – seed them with
`seedFakeMobilePrimary`:

```ts
const server = await FakeWaServer.start({ tcp: true })
const store = createStore({})
const primary = await seedFakeMobilePrimary(store, 'phone-session', {
    phoneNumber: '5511999999999'
})

const client = new WaClient({
    store,
    sessionId: 'phone-session',
    mobileTransport: { deviceInfo: primary.deviceInfo, tcpUrl: server.tcpUrl },
    testHooks: { noiseRootCa: server.noiseRootCa }
})
```

### Companion hosting (a phone links a companion)

The inverse of `runPairing`: the identity is signed by a real mobile-primary
client rather than by the server, which relays that signed exchange and does the
account bookkeeping around it. `offerCompanionPairing(pipeline)` pushes the refs
a companion turns into its QR; when the primary uploads `pair-device` for one of
them, the server mints the device jid, hands the signed identity to the
companion as `pair-success`, and tracks the link.

```ts
await server.offerCompanionPairing(companionPipeline)
const linked = await primary.mobile.linkCompanion(qrFromCompanion)
server.companionHost.linkedCompanions() // [{ deviceJid, keyIndex, ... }]
```

The pairing-code flow works the same way end to end: the server mints the ref on
`companion_hello` and relays `primary_hello` / `companion_finish` between the two
clients, so `client.auth.requestPairingCode()` on one side and
`client.mobile.linkCompanionByCode()` on the other complete a real handshake.

`pushAccountSyncDevices(pipeline)` pushes the account's device set as an
`account_sync` notification – pass a shorter list to tell a primary that a
device disappeared while it was offline.

## IQ coverage

Every outbound IQ the lib sends during normal operation is handled:

| IQ                                                                               | Handler                       | State mutation                            |
| -------------------------------------------------------------------------------- | ----------------------------- | ----------------------------------------- |
| `abt` get                                                                        | `abprops`                     | Seedable via `setAbProps()`               |
| `w:p` / `urn:xmpp:ping` get                                                      | `whatsapp-ping` / `xmpp-ping` | Ack                                       |
| `encrypt` set                                                                    | `prekey-upload`               | Captures bundle, resets dispenser         |
| `encrypt` get `<digest>`                                                         | `signal-digest`               | Returns 404 → forces upload               |
| `encrypt` get `<count>`                                                          | `prekey-count`                | Serves remaining dispenser prekey count   |
| `encrypt` set `<rotate>`                                                         | `signed-prekey-rotate`        | Ack                                       |
| `encrypt` get `<key>`                                                            | `prekey-fetch`                | Serves peer bundles from registry         |
| `passive` set                                                                    | `passive-mode`                | Ack                                       |
| `usync` get                                                                      | `usync`                       | Resolves device IDs from registry         |
| `w:m` set `<media_conn>`                                                         | `media-conn`                  | Points lib at fake HTTPS server           |
| `w:sync:app:state` set                                                           | `app-state-sync`              | Serves patches/snapshots from providers   |
| `w:g2` get `<query>`                                                             | `group-metadata`              | Serves from group registry                |
| `w:g2` set `<create\|add\|remove\|promote\|demote\|subject\|description\|leave>` | `group-*`                     | Mutates group registry                    |
| `privacy` get                                                                    | `privacy-get`                 | Serves settings + disallowed lists        |
| `privacy` set `<privacy>`                                                        | `privacy-set`                 | Mutates privacy state                     |
| `privacy` set `<tokens>`                                                         | `privacy-token-issue`         | Captures issued tokens                    |
| `blocklist` get/set                                                              | `blocklist-*`                 | Mutates blocklist                         |
| `w:profile:picture` get/set                                                      | `profile-picture-*`           | Mutates profile picture registry          |
| `status` set                                                                     | `status-set`                  | Captures latest status                    |
| `w:biz` get/set                                                                  | `business-profile-*`          | Serves/captures business profiles         |
| `md` set `<remove-companion-device>`                                             | `remove-companion-device`     | Unlinks a hosted device, else logs out    |
| `md` set `<pair-device>`                                                         | `companion-pair-device`       | Mints the device jid, relays pair-success |
| `md` set `<key-index-list>`                                                      | `companion-key-index-list`    | Records the published list                |
| `md` set `<link_code_companion_reg>`                                             | `link-code-companion-reg`     | Relays the pairing-code handshake         |
| `newsletter` get `<my_addons>`                                                   | `newsletter-my-addons`        | Ack                                       |
| `urn:xmpp:whatsapp:dirty` set                                                    | `dirty-bits-clear`            | Captures cleared bits                     |

## Using with non-zapo-js clients

The fake server speaks the real wire protocol, so other WhatsApp Web libraries (Baileys forks, whatsmeow, ...) can connect to it too. The recipe:

1. **Point the client's WebSocket URL at `server.url`** (the upgrade path is `/ws/chat`, same as production).
2. **Trust the fake root CA.** The server signs its Noise cert chain with a per-instance random root; clients that verify the cert signature against WhatsApp's pinned production key must be told to trust `server.noiseRootCa.publicKey` instead (exposed via the CLI's `--json` as `noiseRootCa.publicKeyHex`). The chain carries a valid `notBefore`/`notAfter` window, so clients that enforce validity work out of the box.
3. **Post-connect IQs are answered by default**: the `passive` set IQ and the `encrypt` get `<count>` prekey-count query, which Baileys-family and whatsmeow clients block on before reporting the connection as open.
4. **Offline drain bulletin**: after every login the server sends `<ib><offline count="0"/></ib>`, which Baileys-family clients require before flushing their buffered events.
5. **QR pairing**: in-process, use `server.runPairing(...)` with the client's `advSecretKey` + identity public key; from the standalone CLI, use `--pair <device-jid>` and paste the QR payload the client displays when prompted.

## Benchmarking

```bash
# Default: 1000 contacts × 2 devices, 4 groups × 500 members, 1000 msgs/scenario
npm --workspace=@zapo-js/fake-server run bench:messaging

# With CPU + heap profiling (separate process for clean lib-only profiles)
node --expose-gc --import tsx packages/fake-server/bench/messaging.bench.ts \
  --separate-process --cpu --per-scenario --heap --out-dir=./profiles

# Focused on a single scenario
ZAPO_BENCH_SCENARIOS=send_group ZAPO_BENCH_MESSAGES=2000 \
node --expose-gc --import tsx packages/fake-server/bench/messaging.bench.ts --cpu
```

### Profiling flags

| Flag                      | Output                                                           |
| ------------------------- | ---------------------------------------------------------------- |
| `--cpu`                   | `cpu-<ts>.cpuprofile` (whole run)                                |
| `--heap`                  | `heap-<ts>.heaptimeline` (allocation tracking)                   |
| `--snapshot`              | `snapshot-{start,end}-<ts>.heapsnapshot`                         |
| `--per-scenario`          | Per-scenario CPU profiles                                        |
| `--snapshot-per-scenario` | Per-scenario heap snapshots                                      |
| `--separate-process`      | Forks fake server into child process for clean lib CPU profiling |
| `--out-dir=<path>`        | Output directory (default: cwd)                                  |

### Env vars

| Var                          | Default | Description                                                  |
| ---------------------------- | ------- | ------------------------------------------------------------ |
| `ZAPO_BENCH_CONTACTS`        | 1000    | Number of contacts                                           |
| `ZAPO_BENCH_CONTACT_DEVICES` | 2       | Devices per contact                                          |
| `ZAPO_BENCH_GROUPS`          | 4       | Number of groups                                             |
| `ZAPO_BENCH_GROUP_MEMBERS`   | 500     | Members per group                                            |
| `ZAPO_BENCH_MESSAGES`        | 1000    | Messages per scenario                                        |
| `ZAPO_BENCH_SCENARIOS`       | all     | CSV of: `send_1to1`, `recv_1to1`, `send_group`, `recv_group` |
| `ZAPO_BENCH_JSON`            | 0       | Set to `1` to print JSON results                             |
| `ZAPO_BENCH_VERBOSE`         | 0       | Set to `1` to forward lib warns/errors                       |

## CLI

The package ships a `fake-wa-server` bin, so the standalone server works from any project (or no project at all):

```bash
# One-off via npx
npx @zapo-js/fake-server --port 5222 --peer 5511888@s.whatsapp.net --log

# Installed as a dev dependency
npx fake-wa-server --port 5222 --peer 5511888@s.whatsapp.net --log

# First-time QR pairing: prompts on stdin for the QR payload the client displays
npx fake-wa-server --port 5222 --pair 5511999:1@s.whatsapp.net

# Print connection info (url + noise root CA hex) as JSON, for scripting
npx fake-wa-server --json
```

From inside this monorepo (runs the source, no build needed):

```bash
npm --workspace=@zapo-js/fake-server run cli -- --port 5222 --peer 5511888@s.whatsapp.net --log
```

Run with `--help` for the full flag list.

## Test suite

```bash
npm --workspace=@zapo-js/fake-server test
# 164 tests, --test-concurrency=1
```

Cross-check tests drive a real `WaClient` against the fake server and assert on both sides (lib emits correct events, peer decrypts correctly). Unit tests validate protocol builders/parsers in isolation.
