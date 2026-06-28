# @zapo-js/voip

WhatsApp **VOIP / calling** plugin for [`zapo-js`](https://github.com/vinikjkkj/zapo).

Registers on `WaClient` via the plugin system and exposes everything at **`client.voip`**: MLow voice codec (WhatsApp's Opus variant through [`libmlow-wasm`](https://www.npmjs.com/package/libmlow-wasm)), RTP/SRTP, STUN, WebRTC/SCTP relay transport, and `<call>` signaling (offer / accept / preaccept / transport / relaylatency / mute / terminate).

Incoming `<call>`, call-class `<ack>`, and call `<receipt>` stanzas are handled automatically (prepend handlers return `true` so the core client does not double-ack).

> Calls flow over WhatsApp relay servers using the MLow codec. This package handles **audio** calls with **pre-recorded** files or **live** 16 kHz mono PCM. Video is offered in signaling but not encoded.

## Install

```bash
npm install zapo-js @zapo-js/voip libmlow-wasm
```

Peer dependencies:

| Package        | Required       | Purpose                                         |
| -------------- | -------------- | ----------------------------------------------- |
| `zapo-js`      | yes            | `WaClient` and plugin host                      |
| `libmlow-wasm` | yes            | MLow encode/decode (WASM, no native build step) |
| `@roamhq/wrtc` | for real calls | SCTP relay transport                            |
| `ffmpeg` (CLI) | optional       | Decode pre-recorded audio files (`loadAudio`)   |

```bash
npm install @roamhq/wrtc
```

Node **20.9+**. `libmlow-wasm` is ESM-only; the codec loads it via dynamic `import()`.

## Quick start

Importing from `@zapo-js/voip` applies `WaClient` type extensions (`client.voip` and `voip_*` events):

```ts
import { WaClient } from 'zapo-js'
import { voipPlugin, EndCallReason } from '@zapo-js/voip'

const client = new WaClient({
    store,
    sessionId: 'main',
    plugins: [voipPlugin()]
})

await client.connect()

client.on('voip_call_incoming', async (call) => {
    await client.voip.acceptCall(call.callId)
})

client.on('voip_call_state', (call) => {
    console.log(call.callId, call.stateData.state)
})

client.on('voip_call_inbound_audio', ({ call, pcm }) => {
    // Float32Array @ 16 kHz mono from the peer for this call
})

client.on('voip_call_outbound_audio_finished', (call) => {
    // preloaded file finished sending on this call
})
```

## Multi-call (`maxConcurrentCalls`)

By default only **one** non-ended call is allowed at a time (`maxConcurrentCalls: 1`). Additional incoming offers are tracked with `canAccept: false` (no preaccept sent) until a slot frees; use `call.canReject` to decline manually.

Increase the limit explicitly to enable parallel calls (each with isolated relay/codec/audio):

```ts
plugins: [voipPlugin({ maxConcurrentCalls: 2 })]
```

Every audio/control API is scoped by `callId`. To mirror the same microphone into two active calls, call `feedLiveAudio(callId, chunk)` for each call.

## Outgoing call – pre-recorded audio

`loadAudio` shells out to the `ffmpeg` binary (must be on `PATH`) to decode the file to 16 kHz mono PCM before encoding.

```ts
const callId = await client.voip.startCall({
    peerJid: '5511999999999@s.whatsapp.net'
})

await client.voip.loadAudio(callId, './hello.mp3')

// optional: react when the file finishes playing out
client.on('voip_call_outbound_audio_finished', (call) => {
    console.log('outbound audio done', call.callId)
})

// ... later
await client.voip.endCall(callId, EndCallReason.UserEnded)
```

## Outgoing call – live audio

```ts
const callId = await client.voip.startCall({ peerJid: '5511999999999@s.whatsapp.net' })

client.voip.setExternalAudioMode(callId, true)

// feed 16 kHz mono Float32 chunks as they arrive
client.voip.feedLiveAudio(callId, pcmChunk)
```

## Incoming calls

The plugin registers incoming handlers; you only need to react to events:

```ts
client.on('voip_call_incoming', (call) => {
    console.log('ringing from', call.peerJid, call.callId)
})

// accept / reject / end
await client.voip.acceptCall(callId)
await client.voip.rejectCall(callId)
await client.voip.endCall(callId)
```

`getCalls()` returns every tracked call. `getCall(callId)` returns one call or `null`.

## Events

Emitted on `WaClient`:

| Event                               | Payload                                 | When                                      |
| ----------------------------------- | --------------------------------------- | ----------------------------------------- |
| `voip_call_incoming`                | `CallInfo`                              | Remote offer received                     |
| `voip_call_state`                   | `CallInfo`                              | State transition                          |
| `voip_call_ended`                   | `CallInfo`                              | Call finished                             |
| `voip_call_inbound_audio`           | `{ call: CallInfo; pcm: Float32Array }` | Decoded peer audio received (16 kHz)      |
| `voip_call_outbound_audio_finished` | `CallInfo`                              | Preloaded outbound audio finished sending |
| `voip_call_error`                   | `Error`                                 | Engine error                              |
| `voip_signaling_send`               | `BinaryNode`                            | Outbound signaling stanza                 |

You can also use `client.voip.on('call:state', ...)` etc. on the underlying `EventEmitter` (`CallManagerEvents`).

## `client.voip` API

| Method                                  | Description                                 |
| --------------------------------------- | ------------------------------------------- |
| `startCall({ peerJid, isVideo? })`      | Place an outgoing call; returns `callId`    |
| `acceptCall(callId)`                    | Accept an incoming call                     |
| `rejectCall(callId, reason?)`           | Reject                                      |
| `endCall(callId, reason?)`              | Hang up                                     |
| `loadAudio(callId, path)`               | Load a file for outbound audio on that call |
| `setExternalAudioMode(callId, enabled)` | Switch to live PCM input for that call      |
| `feedLiveAudio(callId, Float32Array)`   | Push a capture chunk (external mode)        |
| `setMute(callId, muted)`                | Mute/unmute local capture for that call     |
| `getCall(callId)`                       | One call or `null`                          |
| `getCalls()`                            | All tracked calls                           |
| `on` / `off` / `once`                   | Manager-level events                        |

Plugin options: `maxConcurrentCalls?: number` (default `1`), `logLevel?: LogLevel` (caps VOIP diagnostics; defaults to the host client's level).

## Codec

MLow runs through **`libmlow-wasm`** (≥ 0.1.1): 16 kHz, mono, 960-sample frames (60 ms), `useSmpl: true`, DTX enabled. No `koffi`, no bundled native libraries.

The signaling and media stack (RTP/SRTP, SCTP relay, codec, audio engine) is internal to the package; use `client.voip` and the events above.

## License

MIT
