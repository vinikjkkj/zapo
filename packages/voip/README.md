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
    // 960-sample Float32Array @ 16 kHz mono, one every 60 ms of call time
    // that has something queued; a tick with nothing queued is skipped
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

// feed 16 kHz mono Float32 chunks as they arrive;
// feedLiveAudio returns the buffered ms still queued to send
const bufferedMs = client.voip.feedLiveAudio(callId, pcmChunk)

// backpressure: pause your source above pauseMs, resume below resumeMs
const { pauseMs, resumeMs } = client.voip.getFeedWatermarksMs()
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

## Raise hand

Raising a hand is durable state, not a one-off notification: the peer keeps seeing the hand until it is lowered, and each participant only ever controls its own. Announcing a state already in force sends nothing, in either direction.

```ts
await client.voip.setHandRaised(callId, true)
// the call is active and the peer now sees the hand
await client.voip.setHandRaised(callId, false)

client.on('voip_call_hand_raise', ({ call, participantJid, raised }) => {
    console.log(participantJid, raised ? 'raised a hand' : 'lowered a hand')
    console.log('hands up:', [...call.raisedHands])
})
```

The local state is `call.stateData.handRaised`; the remote ones are the device JIDs in `call.raisedHands`. The call has to be active, otherwise `setHandRaised` is a no-op.

A raised hand travels as one of two distinct message types, and the peer picks which by a gate of its own: the `<user_action action='raise_hand'>` envelope, or an older top-level `<raise_hand>`. Both are read, and both produce the same state and the same event; this package announces its own hand with the first.

## Events

Emitted on `WaClient`:

| Event                               | Payload                                             | When                                                                                           |
| ----------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `voip_call_incoming`                | `CallInfo`                                          | Remote offer received                                                                          |
| `voip_call_state`                   | `CallInfo`                                          | State transition                                                                               |
| `voip_call_ended`                   | `CallInfo`                                          | Call finished                                                                                  |
| `voip_call_inbound_audio`           | `{ call: CallInfo; pcm: Float32Array }`             | Decoded peer audio, paced 960 samples / 60 ms (16 kHz); a tick with nothing queued is skipped  |
| `voip_call_inbound_video`           | `{ call: CallInfo; frame: InboundVideoFrame }`      | One reassembled H.264 access unit of a peer video stream, keyed by `frame.ssrc`                |
| `voip_call_inbound_video_rtp`       | `{ call: CallInfo; packet: InboundVideoRtpPacket }` | Each decrypted inbound video RTP packet, before reassembly                                     |
| `voip_call_outbound_audio_finished` | `CallInfo`                                          | Preloaded outbound audio finished sending                                                      |
| `voip_call_peer_mute`               | `{ call: CallInfo; muted: boolean }`                | Peer announced a change of its own microphone state                                            |
| `voip_call_reaction`                | `{ call: CallInfo; reaction: WaCallReaction }`      | A participant sent an emoji reaction                                                           |
| `voip_call_hand_raise`              | `{ call, participantJid, raised }`                  | A remote participant raised or lowered its hand                                                |
| `voip_call_screen_share`            | `{ call: CallInfo; share: PeerScreenShare }`        | The peer reported a screen-share state change                                                  |
| `voip_call_peer_video_state`        | `{ call: CallInfo; change: PeerVideoStateChange }`  | The peer changed its video state mid-call, which is also how it upgrades a voice call to video |
| `voip_call_error`                   | `Error`                                             | Engine error                                                                                   |

You can also use `client.voip.on('call_state', ...)` etc. for the manager-level events (`CallManagerEvents`).

## Screen share

When the peer starts or stops sharing its screen, the state is parsed onto `call.peerScreenShare` and emitted:

```ts
import { WA_SCREEN_SHARE_STATE } from '@zapo-js/voip'

client.on('voip_call_screen_share', ({ call, share }) => {
    if (share.state === WA_SCREEN_SHARE_STATE.Started) {
        console.log('peer is sharing', share.screenWidth, share.screenHeight)
    }
})
```

Every field of `PeerScreenShare` (`state`, `requestState`, `version`, `screenWidth`, `screenHeight`, `deviceOrientation`) is `null` when the stanza did not carry it, and unknown numbers are passed through rather than collapsed into a known name.

Sharing your own screen is `setScreenShare`:

```ts
await client.voip.setScreenShare(callId, true)
// every access unit fed from here on is what the peer renders as the screen
client.voip.feedLiveVideo(callId, screenAccessUnit, timestampUs)

await client.voip.setScreenShare(callId, false)
```

**The share is not a second stream.** It travels on the video stream the call already has, on the same SSRCs and the same payload type, so a share is a statement about what the picture _is_, not a new media path – nothing on the wire moves when one starts. That is the mechanism of `WA_SCREEN_SHARE_SEND_VERSION` (`V2`), the version announced here: at `V2` the sharer's camera is off for as long as the share lasts and the screen takes its place. So stop feeding the camera before starting a share and resume after stopping it; the local state is `call.stateData.screenSharing`.

A share needs the call to carry video: on a voice call, agree an upgrade with `requestVideoUpgrade` first, otherwise `setScreenShare` throws. It also throws on a group call, which WhatsApp's own clients refuse to share in.

One stanza goes out per change: a `<screen_share>` carrying `screenshare_state` and the version, which is what a capture of the reference client shows a share sending and all it sends. A failure is thrown with nothing changed, so a peer that never heard is never believed to be rendering.

From `WA_SCREEN_SHARE_VERSION.V3` on, a sharer runs its screen and its camera at the same time as two streams. Those two do **not** get distinct SSRCs – a screen share has no SSRC space of its own, and every stream of it derives from the same call id, device jid, stream index and slot as the camera's. How a `V3` sender lays its two streams over that one space is not established, which is why this package shares at `V2` and never announces `V3`.

Every `<call>` child is answered with `<ack class="call" type="<tag>">`, so a `screen_share` is acknowledged as `type="screen_share"`. No screen-share acknowledgement with a tag of its own appears among the message types, and the video-state acknowledgement turned out to be exactly this generic shape, so that is most likely the whole handshake – read by analogy, not from a capture.

### Audio to video, mid-call

A voice call becomes a video call without a new offer: both sides negotiate it
with `<video>` stanzas and the call, its transport and its crypto carry on
untouched. `change.state` on `voip_call_peer_video_state` is the raw number
from the wire, which is exactly the ordinal of the exported `WA_VIDEO_STATE` -
there is no separate wire enum and nothing is translated.

Asking for it:

```ts
import { WA_VIDEO_UPGRADE_RESULT } from '@zapo-js/voip'

const result = await client.voip.requestVideoUpgrade(callId)
if (result === WA_VIDEO_UPGRADE_RESULT.Accepted) {
    client.voip.feedLiveVideo(callId, annexBAccessUnit, timestampUs)
}
```

It is a handshake, not an announcement. The request goes out as
`UpgradeRequestV2`, **no video RTP leaves before the peer accepts**, and the
wait is bounded by the same five-second guard timer the peer runs, after which
this side withdraws and the call stays audio. The four ways it can fail are
reported apart: `rejected` (declined), `rejected_by_timeout` (nobody answered),
`error` (the peer could not), and `timeout` (silence, which says nothing about
whether the request was even seen).

Answering one:

```ts
import { WA_VIDEO_STATE } from '@zapo-js/voip'

client.on('voip_call_peer_video_state', async ({ call, change }) => {
    if (change.state === WA_VIDEO_STATE.UpgradeRequestV2) {
        await client.voip.acceptVideoUpgrade(call.callId)
    }
})
```

Either way the peer's stream is subscribed on the relay and answered with
key-frame requests and bandwidth feedback, and inbound frames arrive through
`voip_call_inbound_video` as on any video call. The receive path opens on the
first sign of peer video even without a handshake, so a peer that just turns
its camera on is never left with nowhere to land.

The order of the handshake is taken from the peer's own signalling code and from
the enum of the current WhatsApp Web build, which agree with each other; it has
not been confirmed against a two-sided wire capture yet.

## `client.voip` API

| Method                                                       | Description                                                                |
| ------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `startCall({ peerJid, isVideo?, audioFile?, peerDevices? })` | Place an outgoing call; returns `callId`                                   |
| `acceptCall(callId)`                                         | Accept an incoming call                                                    |
| `rejectCall(callId, reason?)`                                | Reject                                                                     |
| `endCall(callId, reason?)`                                   | Hang up                                                                    |
| `loadAudio(callId, path)`                                    | Load a file for outbound audio on that call                                |
| `setExternalAudioMode(callId, enabled)`                      | Switch to live PCM input for that call                                     |
| `feedLiveAudio(callId, Float32Array)`                        | Push a capture chunk (external mode); returns buffered ms                  |
| `getLiveBufferMs(callId)`                                    | Buffered live-audio ms not yet sent                                        |
| `getFeedWatermarksMs()`                                      | `{ pauseMs, resumeMs }` backpressure thresholds                            |
| `setMute(callId, muted)`                                     | Mute/unmute local capture and tell the peer                                |
| `sendReaction(callId, glyph)`                                | Send an emoji reaction on that call; `false` if nothing went on the wire   |
| `setHandRaised(callId, raised)`                              | Raise/lower the local hand and announce it to the peer                     |
| `setScreenShare(callId, sharing)`                            | Start/stop sharing the screen on the call's video stream and tell the peer |
| `requestVideoUpgrade(callId)`                                | Ask to turn an audio call into a video call; resolves with the outcome     |
| `acceptVideoUpgrade(callId)` / `rejectVideoUpgrade(callId)`  | Answer an upgrade the peer asked for                                       |
| `cancelVideoUpgrade(callId)`                                 | Withdraw an upgrade request before the peer answers                        |
| `getCall(callId)`                                            | One call or `null`                                                         |
| `getCalls()`                                                 | All tracked calls                                                          |
| `on` / `off` / `once`                                        | Manager-level events                                                       |

Plugin options: `maxConcurrentCalls?: number` (default `1`), `logLevel?: LogLevel` (caps VOIP diagnostics; defaults to the host client's level), `useOriginalRelayPort?: boolean` (default `false`, see below).

## Mute

`setMute(callId, muted)` stops your own capture and sends the peer a `<mute_v2>` carrying the new
state, which is what draws a mic-off indicator on the other side. Capture keeps ticking and feeds
silence, so the stream and its SSRC stay alive and unmuting takes effect on the next frame. Incoming
announcements land on `voip_call_peer_mute` and on `call.stateData.peerAudioMuted`.

Muting **another** participant is a different mechanism, carried by the same stanza under a second
attribute, and it is not implemented: WhatsApp restricts it to group calls, this package only places
1:1 calls, and a client that receives such a request on a 1:1 call drops it. An incoming one is
logged and ignored here as well.

## Reactions

An emoji reaction travels in-band on the call's media socket, not as a call
stanza: it is an RTP packet on the app-data stream, protected with the same
per-jid end-to-end key as the audio.

```ts
client.on('voip_call_reaction', ({ call, reaction }) => {
    console.log(reaction.reaction) // the glyph itself, never an index
})

client.voip.sendReaction(callId, '❤️')
```

Reactions are momentary and carry no state, so nothing is recorded on
`CallInfo`: a listener that misses the event has nowhere to read it back from.

`sendReaction` returns `false` when nothing was put on the wire, which on a call
that is not active is the only reason it does. Nothing negotiates the payload
type of that stream - each side registers its own and the offer carries none -
so a reaction can go out before the peer has sent any.

## Relay port

Relay endpoints advertise a port each, and the connection is made on the web client port (3480) rather than on the advertised one, which is what WhatsApp Web does. A relay reached on 3478 completes the handshake and carries the uplink but never forwards the peer's stream back, so the call is silently one way.

`useOriginalRelayPort: true` dials the advertised port instead. Against WhatsApp's own relays that is the wrong choice, for the reason above; it exists for a relay deployment that answers on the port it advertises.

```ts
plugins: [voipPlugin({ useOriginalRelayPort: true })]
```

## Codec

MLow runs through **`libmlow-wasm`** (≥ 0.1.1): 16 kHz, mono, 960-sample frames (60 ms), `useSmpl: true`, DTX enabled. No `koffi`, no bundled native libraries.

The signaling and media stack (RTP/SRTP, SCTP relay, codec, audio engine) is internal to the package; use `client.voip` and the events above.

## Credits

The VOIP plugin was built by:

- [@vinikjkkj](https://github.com/vinikjkkj)
- [@edgardmessias](https://github.com/edgardmessias) — Edgard Lorraine Messias
- [@w3nder](https://github.com/w3nder) — Wender Teixeira

## License

MIT
