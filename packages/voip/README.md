# @zapo-js/voip

Native WhatsApp **VOIP / calling** engine for [`zapo-js`](https://github.com/vinikjkkj/zapo).

It ports the full call media stack - the **MLow** voice codec (WhatsApp's Opus
variant, loaded from a bundled native library via [`koffi`](https://koffi.dev)),
RTP/SRTP packetization, STUN, and the WebRTC/SCTP relay transport - plus the
`<call>` signaling (offer / accept / preaccept / transport / relaylatency /
mute / terminate). The media stack is library-agnostic; the only WhatsApp-library
specific part is a small **`VoipSocket`** adapter you wire from your client.

> Calls flow over WhatsApp's relay servers using the MLow codec. This package
> handles **audio** calls with either **pre-recorded** files or **live** PCM
> streaming. Video is offered but not encoded.

## Install

```bash
npm install @zapo-js/voip
```

`koffi` is a required peer dependency (loads the native MLow codec). `@roamhq/wrtc`
is an optional peer dependency required for the relay transport (real calls):

```bash
npm install koffi @roamhq/wrtc
```

Prebuilt MLow binaries for macOS (universal), Linux (x64/arm64) and Windows ship
inside the package's `native/` directory. Override the path with `MLOW_LIB_PATH`
if needed.

## The `VoipSocket` seam

The engine needs a handful of primitives from your WhatsApp client - sending
stanzas, Signal encrypt/decrypt of the per-call key, USync device discovery and
participant-node fan-out. The media stack is otherwise library-agnostic, so this
adapter is the only WhatsApp-library specific part.

### With `zapo-js` (recommended)

`WaClient` exposes a ready-made adapter at **`client.voip`** - just hand it to
`createVoipManager`, no manual wiring:

```ts
import { WaClient } from 'zapo-js'
import { createVoipManager } from '@zapo-js/voip'

const client = new WaClient(/* ... */)
await client.connect()

const manager = createVoipManager(client.voip, { debug: true })
```

### Any other library

Implement the `VoipSocket` contract yourself (see `src/voip-socket.ts`):

```ts
import type { VoipSocket } from '@zapo-js/voip'

const socket: VoipSocket = {
    authState, // { creds: { me, account }, keys }
    user, // { lid, id }
    sendNode, // (node) => Promise<void>
    query, // (node) => Promise<BinaryNode>
    signalRepository, // { encryptMessage, decryptMessage, lidMapping }
    assertSessions, // (jids, force?) => Promise<void>
    getUSyncDevices, // (jids, ...) => Promise<Device[]>
    createParticipantNodes // (devices, message, attrs) => { nodes, shouldIncludeDeviceIdentity }
}
```

## Outgoing call - pre-recorded audio

```ts
import { createVoipManager, EndCallReason } from '@zapo-js/voip'

const manager = createVoipManager(client.voip, { debug: true })
await manager.loadAudio('./hello.mp3')

manager.on('call:state', (call) => console.log(call.stateData.state))
manager.on('call:audio', (pcm) => {
    /* received audio (Float32Array @16kHz) */
})

const callId = await manager.startCall({ peerJid: '5511999999999@s.whatsapp.net' })
// ...later
await manager.endCall(EndCallReason.UserEnded)
```

## Outgoing call - live audio

```ts
const manager = createVoipManager(client.voip)
manager.setExternalAudioMode(true) // live input mode
const callId = await manager.startCall({ peerJid })

// feed live 16 kHz mono PCM as it arrives
manager.feedLiveAudio(pcmChunk) // Float32Array

manager.on('call:audio', (pcm) => {
    /* peer audio */
})
```

## Routing incoming call stanzas

Feed raw `<call>` / call-`ack` / call-`receipt` nodes from your client to the
provided routers. They ACK the stanza and dispatch to the manager:

```ts
import { routeCallStanza, routeCallAck, routeCallReceipt } from '@zapo-js/voip'

// raw "call" stanza  → offer/accept/transport/... handlers
await routeCallStanza(manager, client.voip, node)
// class="call" ack   → relay allocation
await routeCallAck(manager, node)
// call-related receipt → ack back
await routeCallReceipt(client.voip, node)

manager.on('call:incoming', (call) => manager.acceptCall(call.callId))
```

## License

MIT
