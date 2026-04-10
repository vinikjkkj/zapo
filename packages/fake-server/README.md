# @zapo-js/fake-server

In-process fake WhatsApp Web server that drives the real `zapo-js` `WaClient` end-to-end — full Noise XX/IK handshake, QR pairing, Signal Protocol (X3DH + Double Ratchet), SenderKey for groups, media upload/download over self-signed HTTPS, app-state sync — all without touching WhatsApp servers.

## Quick start

```ts
import { FakeWaServer } from '@zapo-js/fake-server'
import { createStore, WaClient } from 'zapo-js'

const server = await FakeWaServer.start()
const client = new WaClient({
    store: createStore({ providers: { auth: 'memory', signal: 'memory', senderKey: 'memory', appState: 'memory' } }),
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

```
src/
├── api/                     # Public-facing API
│   ├── FakeWaServer.ts      # Main facade — WS server, IQ router, registries, lifecycle
│   ├── FakePeer.ts          # Simulated WhatsApp peer — Signal crypto, send/recv, groups
│   ├── FakePairingDriver.ts # QR pairing flow orchestrator
│   └── Scenario.ts          # Declarative test scenario DSL
├── protocol/                # Protocol-layer builders, parsers, crypto
│   ├── auth/                # Pairing, ADV identity, cert chain, client payload
│   ├── iq/                  # IQ stanza handlers (abprops, privacy, groups, profile, ...)
│   ├── push/                # Inbound stanza builders (message, notification, receipt, ...)
│   ├── signal/              # Signal Protocol impl (Double Ratchet, SenderKey, prekeys)
│   └── stream/              # Stream error builders
├── infra/                   # Transport infrastructure
│   ├── WaFakeWsServer.ts    # Raw WebSocket server (ws)
│   ├── WaFakeConnection.ts  # Per-connection WS wrapper
│   ├── WaFakeConnectionPipeline.ts  # Noise handshake + authenticated frame transport
│   ├── WaFakeFrameSocket.ts # Length-prefixed framing layer
│   ├── WaFakeTransport.ts   # AES-GCM noise transport (post-handshake encrypt/decrypt)
│   └── WaFakeMediaHttpsServer.ts  # Self-signed HTTPS media up/download
├── state/                   # State stores
│   ├── fake-media-store.ts  # In-memory media blob store
│   └── fake-app-state-collection.ts  # App-state patch/snapshot provider
├── transport/               # Re-exports from zapo-js (codec, crypto, protos)
└── __tests__/               # Cross-check test suite (144 tests)
    └── helpers/             # Shared test utilities (zapo-client factory)

bench/
├── messaging.bench.ts       # 4-scenario messaging profiler (send/recv × 1:1/group)
├── server-process.ts        # Child-process entry for --separate-process mode
└── server-rpc.ts            # IPC client for the child-process server
```

## Core concepts

### FakeWaServer

Central facade. Manages the WS listener, noise handshake, IQ router, and all state registries:

- **Peer registry** (`peerRegistry`): maps device JIDs → `FakePeer` instances. The global `usync` + `prekey-fetch` IQ handlers consult this.
- **Group registry** (`groupRegistry`): maps group JIDs → group metadata + participants. The `w:g2` handler serves it.
- **IQ router** (`WaFakeIqRouter`): first-match-wins stanza dispatcher with `{ xmlns, type, childTag }` matchers. ~20 global handlers registered in the constructor cover every IQ the lib emits during normal operation.
- **Prekey dispenser**: hands out unique one-time prekeys from the lib's upload to FakePeers. Resets on each forced refill (`triggerPreKeyUpload({ force: true })`).
- **Listener fan-outs**: `onOutboundGroupOp`, `onOutboundPrivacySet`, `onOutboundBlocklistChange`, `onOutboundProfilePictureSet`, `onOutboundStatusSet`, `onLogout`, `onOutboundPrivacyTokenIssue`, `onOutboundDirtyBitsClear`.

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

## IQ coverage

Every outbound IQ the lib sends during normal operation is handled:

| IQ | Handler | State mutation |
|----|---------|---------------|
| `abt` get | `abprops` | Seedable via `setAbProps()` |
| `w:p` / `urn:xmpp:ping` get | `whatsapp-ping` / `xmpp-ping` | Ack |
| `encrypt` set | `prekey-upload` | Captures bundle, resets dispenser |
| `encrypt` get `<digest>` | `signal-digest` | Returns 404 → forces upload |
| `encrypt` set `<rotate>` | `signed-prekey-rotate` | Ack |
| `encrypt` get `<key>` | `prekey-fetch` | Serves peer bundles from registry |
| `usync` get | `usync` | Resolves device IDs from registry |
| `w:m` set `<media_conn>` | `media-conn` | Points lib at fake HTTPS server |
| `w:sync:app:state` set | `app-state-sync` | Serves patches/snapshots from providers |
| `w:g2` get `<query>` | `group-metadata` | Serves from group registry |
| `w:g2` set `<create\|add\|remove\|promote\|demote\|subject\|description\|leave>` | `group-*` | Mutates group registry |
| `privacy` get | `privacy-get` | Serves settings + disallowed lists |
| `privacy` set `<privacy>` | `privacy-set` | Mutates privacy state |
| `privacy` set `<tokens>` | `privacy-token-issue` | Captures issued tokens |
| `blocklist` get/set | `blocklist-*` | Mutates blocklist |
| `w:profile:picture` get/set | `profile-picture-*` | Mutates profile picture registry |
| `status` set | `status-set` | Captures latest status |
| `w:biz` get/set | `business-profile-*` | Serves/captures business profiles |
| `md` set `<remove-companion-device>` | `remove-companion-device` | Fires logout listeners |
| `newsletter` get `<my_addons>` | `newsletter-my-addons` | Ack |
| `urn:xmpp:whatsapp:dirty` set | `dirty-bits-clear` | Captures cleared bits |

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

| Flag | Output |
|------|--------|
| `--cpu` | `cpu-<ts>.cpuprofile` (whole run) |
| `--heap` | `heap-<ts>.heaptimeline` (allocation tracking) |
| `--snapshot` | `snapshot-{start,end}-<ts>.heapsnapshot` |
| `--per-scenario` | Per-scenario CPU profiles |
| `--snapshot-per-scenario` | Per-scenario heap snapshots |
| `--separate-process` | Forks fake server into child process for clean lib CPU profiling |
| `--out-dir=<path>` | Output directory (default: cwd) |

### Env vars

| Var | Default | Description |
|-----|---------|-------------|
| `ZAPO_BENCH_CONTACTS` | 1000 | Number of contacts |
| `ZAPO_BENCH_CONTACT_DEVICES` | 2 | Devices per contact |
| `ZAPO_BENCH_GROUPS` | 4 | Number of groups |
| `ZAPO_BENCH_GROUP_MEMBERS` | 500 | Members per group |
| `ZAPO_BENCH_MESSAGES` | 1000 | Messages per scenario |
| `ZAPO_BENCH_SCENARIOS` | all | CSV of: `send_1to1`, `recv_1to1`, `send_group`, `recv_group` |
| `ZAPO_BENCH_JSON` | 0 | Set to `1` to print JSON results |
| `ZAPO_BENCH_VERBOSE` | 0 | Set to `1` to forward lib warns/errors |

## CLI

```bash
# Standalone server for manual testing
npm --workspace=@zapo-js/fake-server run cli -- --port 5222 --peer 5511888@s.whatsapp.net --log info
```

## Test suite

```bash
npm --workspace=@zapo-js/fake-server test
# 144 tests, ~130s, --test-concurrency=1
```

Cross-check tests drive a real `WaClient` against the fake server and assert on both sides (lib emits correct events, peer decrypts correctly). Unit tests validate protocol builders/parsers in isolation.
