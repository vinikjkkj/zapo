# @zapo-js/voip

WhatsApp **VOIP / calling** plugin for [`zapo-js`](https://github.com/vinikjkkj/zapo).

Registers on `WaClient` via the plugin system and exposes everything at **`client.voip`**: MLow voice codec (WhatsApp's Opus variant through [`libmlow-wasm-fork`](https://www.npmjs.com/package/libmlow-wasm-fork)), RTP/SRTP, STUN, WebRTC/SCTP relay transport, and `<call>` signaling (offer / accept / preaccept / transport / relaylatency / mute / terminate).

Incoming `<call>`, call-class `<ack>`, and call `<receipt>` stanzas are handled automatically (prepend handlers return `true` so the core client does not double-ack).

> Calls flow over WhatsApp relay servers using the MLow codec. This package handles **audio** calls with **pre-recorded** files or **live** 16 kHz mono PCM. Video is offered in signaling but not encoded.

## Install

```bash
npm install zapo-js @zapo-js/voip libmlow-wasm-fork
```

Peer dependencies:

| Package             | Required    | Purpose                                         |
| ------------------- | ----------- | ----------------------------------------------- |
| `zapo-js`           | yes         | `WaClient` and plugin host                      |
| `libmlow-wasm-fork` | local media | MLow encode/decode (WASM, no native build step) |
| `@roamhq/wrtc`      | local media | SCTP relay transport                            |
| `ffmpeg` (CLI)      | optional    | Decode pre-recorded audio files (`loadAudio`)   |

```bash
npm install @roamhq/wrtc
```

Node **20.9+**. `libmlow-wasm-fork` is ESM-only; the codec loads it via dynamic `import()`. The media itself runs on [`@zapo-js/voip-media`](../voip-media), a dependency of this package; with [remote media](#media-in-the-browser-media--mode-remote-) neither `libmlow-wasm-fork` nor `@roamhq/wrtc` is needed here.

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

## Group calls

A group call is placed with the group and the participants to ring, ourselves left out:

```ts
const callId = await client.voip.startCall({
    groupJid: '120363431977320048@g.us',
    participants: [
        { jid: '112984198234339@lid' },
        { jid: '184478207058035@lid', devices: ['184478207058035@lid', '184478207058035:1@lid'] }
    ]
})
```

The offer goes to the call itself (`<call-id>@call`) and names every participant and its devices; `peerJid` is not read. The call connects once the server's roster lists somebody else connected. A participant given no `devices` has them resolved, falling back to its primary device. An incoming group call arrives on `voip_call_incoming` like any other, with `call.isGroupCall` set, and is answered with `acceptCall`. `call.groupJid` is set when the call belongs to a group: a 1:1 call that grows into a group call by inviting this side names none, and is still a group call. `call.joinable` says nothing about it: WhatsApp Web marks its 1:1 calls joinable too. A group callee preaccepts, accepts and declines to the call itself, so a declined call lists this side as invited rather than still ringing.

Who is on the call lives on `call.groupComposition` and every change arrives on `voip_call_participants_changed`, from the server's roster updates or from one participant hanging up:

```ts
client.on('voip_call_participants_changed', ({ call, diff }) => {
    console.log(
        'joined',
        diff.added.map((participant) => participant.jid)
    )
    console.log(
        'left',
        diff.removed.map((removal) => removal.jid)
    )
})
```

The media follows the call: a group offer carries no key, so the call is keyed by the `enc_rekey` a participant sends once we join, and when the server asks this side to rekey, it mints the key and sends it to every connected device. Each participant's device is decrypted with its own key, and when the server moves the call to another relay mid-call, the media moves with it, and is redialled when the server re-credits the relay it is on: over raw UDP on the advertised port when the new relay carries no ICE credential, the ordinary way when it does. A remote media host has to support group calls and raw UDP legs: one that does not is reported once on `voip_call_error`, which rules out the browser host for now.

### Leaving versus ending

```ts
// step out; the call goes on for whoever stays
await client.voip.leaveCall(callId)
// on a group call, the same
await client.voip.endCall(callId)
```

No member can end a group call for everybody, the creator included: `leaveCall` and `endCall` both send the call itself one terminate with no reason, which takes this side off the call. The call ends for everybody when its last member leaves, and the server then sends `group_call_ended`, as with the official client. Either way the local call is over and `voip_call_ended` fires. A call that loses its media path leaves rather than ending it for the others. `leaveCall` throws on a 1:1 call.

On our side, a participant's terminate takes only that participant off an established call; only `group_call_ended`, or the server taking this side itself off (see below), ends it.

When the last other member leaves, the server ends the call within a fraction of a second: there is no state where this side waits alone on the call.

### Staying on the call

Every connected member, this side included, sends the call a heartbeat every 10 seconds for as long as it is on it. Members also watch each other's media: once none of a member's media has reached this side for about 20 seconds, while others' still does, this side reports it to the server as invisible, and the official clients do the same after about 30. The server then takes that member off the call.

When that member is this side, the call goes on without it: `voip_call_ended` fires with `EndCallReason.Invisible` and nothing is sent. The call can be joined again with `joinCall`.

### Ringing, re-ringing and joining

When this side lets a group call ring unanswered, the server ends our ring after about 45 seconds while the call goes on for the others: `voip_call_ended` fires with `EndCallReason.Timeout` and nothing is sent. A participant ringing this side again arrives as a new `voip_call_incoming` for the same call id, with no relay until the server sends one.

A group call this side declined, let ring out, left or was taken off as invisible can be joined while it goes on, under the same call id:

```ts
import { EndCallReason } from '@zapo-js/voip'

client.on('voip_call_ended', async (call) => {
    if (call.isGroupCall && call.stateData.endReason === EndCallReason.Timeout) {
        await client.voip.joinCall(call.callId) // missed it: join it anyway
    }
})
```

`joinCall` sends one accept to the call itself, as the official client's "join" does, and the call goes through `voip_call_state` like an accepted one: the server answers with the relay and asks this side to key the call. It only knows calls whose offer reached this side, and forgets one when the server sends `group_call_ended`, when it is joined, or when a new ring for it arrives; it throws for any other. A member that never received the offer cannot join from here: without it, nothing but a `group_update` would say the call exists.

### In-call features

Mute, raise hand, reactions, video and screen share work on a group call, and every participant event names the device it came from in `participantJid` when the sender can be attributed. Our own announcements go to the call itself, and the per-device state lives on `call.participantMedia`; the 1:1 fields (`stateData.peerAudioMuted`, `peerVideoState`, `peerScreenShare`) stay `undefined` on a group call.

```ts
client.on('voip_call_peer_mute', ({ participantJid, muted }) => {
    console.log(participantJid, muted ? 'muted' : 'unmuted')
})

client.on('voip_call_inbound_video', ({ participantJid, frame }) => {
    render(participantJid, frame) // one stream per sender
})

await client.voip.setVideoEnabled(callId, true) // our camera on, feedLiveVideo from here on
```

- **Mute.** Asking somebody to mute is `requestParticipantMute(callId, participantJid)`, which goes to that participant's device; it decides, and a `voip_call_peer_mute` follows if it complies. A request to this side arrives on `voip_call_mute_requested` and is never applied: comply with `setMute`. WhatsApp Web refuses to ask a phone to mute, so a mobile account rarely receives one.
- **Reactions.** Received per sender with no setup; `participantJid` is set once the media host can attribute them. Clearing a reaction is not reported.
- **Video.** Every camera that is on reaches this side with no subscription, one stream per sender. `setVideoEnabled` turns our camera on and off. On a call that is audio, `requestVideoUpgrade` asks the server to turn the whole call into a video call, which every member then sees as `voip_call_video_upgraded`. Nothing is answered: the member who asked has its camera on once the server confirms, every other camera stays off until its owner calls `setVideoEnabled`. `setVideoSubscriptions` picks whose video to ask for and at which `WA_VIDEO_QUALITY`, but is not sent to the relay yet: video arrives without it.
- **Screen share.** Sent to the call. WhatsApp's desktop clients refuse to show a share in a group call; mobile ones accept it, which has not been confirmed against a live call yet.
- **Participant media.** `voip_call_participant_media` reports when a participant's media starts or stops reaching this side, judged locally from the packets received. With the `participantAudio` plugin option, `voip_call_participant_audio` carries each participant's decoded audio before the mix (local media only).

Not supported on group calls: inviting or removing somebody mid-call.

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

## Media in the browser (`media: { mode: 'remote' }`)

By default a call's media - the relays, SRTP, the codec and the audio clock - runs in this process. With `media: { mode: 'remote' }` none of it does: this process keeps the signaling, and the media runs wherever the audio is, typically the browser of whoever answers, on [`@zapo-js/voip-media`](../voip-media). No media flows through the server, and it needs neither `@roamhq/wrtc` nor `libmlow-wasm-fork`.

Every change to a call's media plan leaves as `voip_call_media`; the host's events come back through `client.voip.media`. The plan carries the call's SRTP keys and relay credentials, so the channel between the two has to be private to that host.

```ts
import { decodeCallMediaEvent, encodeCallMediaMessage } from '@zapo-js/voip-media'

const client = new WaClient({
    store,
    sessionId: 'main',
    plugins: [voipPlugin({ media: { mode: 'remote' } })]
})

client.on('voip_call_media', ({ message }) => agentSocket.send(encodeCallMediaMessage(message)))
agentSocket.on('message', (text) => client.voip.media.handleEvent(decodeCallMediaEvent(text)))

// A host that connects after the call started asks for the whole plan:
const snapshot = client.voip.media.snapshot(callId)
if (snapshot) agentSocket.send(encodeCallMediaMessage(snapshot))
```

In the browser, which needs a secure context (HTTPS or `localhost`) for the microphone and the AudioWorklet:

```ts
import {
    decodeCallMediaMessage,
    encodeCallMediaEvent,
    WaCallMediaReceiver
} from '@zapo-js/voip-media'
import { WaWebCallAudio, webMediaHost } from '@zapo-js/voip-media/web'

const receiver = new WaCallMediaReceiver({
    ...webMediaHost,
    callId,
    send: (event) => socket.send(encodeCallMediaEvent(event))
})
// Listen before any await: a plan that arrives meanwhile would be lost.
socket.onmessage = (event) => receiver.receive(decodeCallMediaMessage(event.data))
await receiver.start()

// The accept stays on the server: the click that answers asks for it and opens the audio.
let audio: WaWebCallAudio | undefined
answerButton.onclick = async () => {
    audio = await WaWebCallAudio.start(receiver.plane)
    await fetch(`/calls/${callId}/accept`, { method: 'POST' }) // runs client.voip.acceptCall(callId)
}

// When `voip_call_ended` reaches the browser:
await audio?.stop()
receiver.stop()
```

On a video call, build the receiver above with `onInboundVideo` too, for the peer's frames, and hand the plane the camera:

```ts
import { WaWebCallVideoReceiver, WaWebCallVideoSender } from '@zapo-js/voip-media/web'

const video = new WaWebCallVideoReceiver({
    onFrame: (frame) => {
        context2d.drawImage(frame, 0, 0)
        frame.close()
    }
})
// In place of the receiver above, wired to the socket the same way:
const receiver = new WaCallMediaReceiver({
    ...webMediaHost,
    callId,
    send: (event) => socket.send(encodeCallMediaEvent(event)),
    onInboundVideo: (frame) => video.push(frame)
})

const [camera] = (await navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()
const sender = await WaWebCallVideoSender.start(receiver.plane, camera)

// When the call ends, next to the audio:
await sender.stop()
camera.stop()
video.close()
```

With remote media, `loadAudio`, `setExternalAudioMode` and `feedLiveAudio` throw, `sendReaction` returns `false`, `feedLiveVideo` returns `0`, and the `voip_call_inbound_*` events never fire: audio, video and reactions live on the media host.

## Events

Emitted on `WaClient`:

| Event                               | Payload                                            | When                                                                                          |
| ----------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `voip_call_incoming`                | `CallInfo`                                         | Remote offer received                                                                         |
| `voip_call_state`                   | `CallInfo`                                         | State transition                                                                              |
| `voip_call_ended`                   | `CallInfo`                                         | Call finished                                                                                 |
| `voip_call_inbound_audio`           | `{ call: CallInfo; pcm: Float32Array }`            | Decoded peer audio, paced 960 samples / 60 ms (16 kHz); a tick with nothing queued is skipped |
| `voip_call_inbound_video`           | `{ call, frame, participantJid? }`                 | One reassembled H.264 access unit of a peer video stream, keyed by `frame.ssrc`               |
| `voip_call_inbound_video_rtp`       | `{ call, packet, participantJid? }`                | Each decrypted inbound video RTP packet, before reassembly                                    |
| `voip_call_outbound_audio_finished` | `CallInfo`                                         | Preloaded outbound audio finished sending                                                     |
| `voip_call_peer_mute`               | `{ call, muted, participantJid? }`                 | A participant announced a change of its own microphone state                                  |
| `voip_call_mute_requested`          | `{ call, participantJid, requestState }`           | A group participant asked this side to mute; nothing is applied                               |
| `voip_call_reaction`                | `{ call, reaction, participantJid? }`              | A participant sent an emoji reaction                                                          |
| `voip_call_hand_raise`              | `{ call, participantJid, raised }`                 | A remote participant raised or lowered its hand                                               |
| `voip_call_screen_share`            | `{ call, share, participantJid? }`                 | A participant reported a screen-share state change                                            |
| `voip_call_peer_video_state`        | `{ call, change, participantJid? }`                | A participant changed its video state mid-call, which is also how a 1:1 voice call upgrades   |
| `voip_call_video_upgraded`          | `{ call, participantJid: string \| null }`         | A participant turned a group call into a video call                                           |
| `voip_call_participants_changed`    | `{ call: CallInfo; diff: WaGroupCompositionDiff }` | Somebody joined a group call, left it or moved to another device                              |
| `voip_call_participant_media`       | `{ call, participantJid, receiving }`              | A group participant's media started or stopped reaching this side                             |
| `voip_call_participant_audio`       | `{ call, participantJid, pcm }`                    | One group participant's decoded audio, before the mix; `participantAudio` option only         |
| `voip_call_media`                   | `{ call: CallInfo; message: WaCallMediaMessage }`  | A change to the media plan, for the host carrying it; remote media only                       |
| `voip_call_error`                   | `Error`                                            | Engine error, or a media host that cannot carry a group call                                  |

You can also use `client.voip.on('call_state', ...)` etc. for the manager-level events (`CallManagerEvents`).

## Screen share

When a participant starts or stops sharing its screen, the state is emitted with the sharing device in `participantJid`, and kept on `call.peerScreenShare` on a 1:1 call or on that device's `call.participantMedia` entry on a group call:

```ts
import { WA_SCREEN_SHARE_STATE } from '@zapo-js/voip'

client.on('voip_call_screen_share', ({ participantJid, share }) => {
    if (share.state === WA_SCREEN_SHARE_STATE.Started) {
        console.log(participantJid, 'is sharing', share.screenWidth, share.screenHeight)
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

A share needs the call to carry video: on a voice call, agree an upgrade with `requestVideoUpgrade` first, otherwise `setScreenShare` throws. On a group call the share goes to the call itself; WhatsApp's desktop clients refuse to show it there, mobile ones accept it.

One stanza goes out per change: a `<screen_share>` carrying `screenshare_state`, the version and `screen_share_id`, a count of the starts and stops sent on the call from 1, which is what the official clients send and all they send. A failure is thrown with nothing changed, so a peer that never heard is never believed to be rendering.

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

After accepting, our frames wait for the peer: they are held until it turns its
own camera on (`WA_VIDEO_STATE.Enabled`) and 300 ms more, or three seconds at
most. Measured against WhatsApp Web, a first packet that reaches the peer before
the stream it sets up for our video exists leaves our video at its key frames
alone for the rest of the call. `feedLiveVideo` returns `0` while held, and the
stream opens on the first key frame fed after, so a source with a long key-frame
interval adds up to one interval on top. An upgrade this side asked for is not
held.

A call that is video from the start is held the same way from the accept, ours
or the peer's: our frames wait for the peer's first `<mute_v2>` after it and
150 ms more, or two seconds at most. On calls we answer, the peer was measured
setting up the stream for our video 160 to 600 ms after the accept, with its
`<mute_v2>` landing close to it; a call we place waits on the same sign but has
not been measured yet.

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
| `startCall({ groupJid, participants, isVideo? })`            | Place a group call; returns `callId`                                       |
| `acceptCall(callId)`                                         | Accept an incoming call                                                    |
| `rejectCall(callId, reason?)`                                | Reject                                                                     |
| `endCall(callId, reason?)`                                   | Hang up; on a group call, step out as `leaveCall` does                     |
| `leaveCall(callId)`                                          | Step out of a group call and leave it running for the others               |
| `joinCall(callId)`                                           | Join a group call in progress that this side declined, missed or left      |
| `loadAudio(callId, path)`                                    | Load a file for outbound audio on that call                                |
| `setExternalAudioMode(callId, enabled)`                      | Switch to live PCM input for that call                                     |
| `feedLiveAudio(callId, Float32Array)`                        | Push a capture chunk (external mode); returns buffered ms                  |
| `getLiveBufferMs(callId)`                                    | Buffered live-audio ms not yet sent                                        |
| `getFeedWatermarksMs()`                                      | `{ pauseMs, resumeMs }` backpressure thresholds                            |
| `setMute(callId, muted)`                                     | Mute/unmute local capture and tell the peer                                |
| `requestParticipantMute(callId, participantJid)`             | Ask a group participant to mute                                            |
| `sendReaction(callId, glyph)`                                | Send an emoji reaction on that call; `false` if nothing went on the wire   |
| `setHandRaised(callId, raised)`                              | Raise/lower the local hand and announce it to the peer                     |
| `setScreenShare(callId, sharing)`                            | Start/stop sharing the screen on the call's video stream and tell the peer |
| `requestVideoUpgrade(callId)`                                | Ask to turn an audio call into a video call; resolves with the outcome     |
| `setVideoEnabled(callId, enabled)`                           | Turn our camera on or off on a group call                                  |
| `setVideoSubscriptions(callId, subscriptions \| null)`       | Pick whose video a group call asks for; not sent to the relay yet          |
| `acceptVideoUpgrade(callId)` / `rejectVideoUpgrade(callId)`  | Answer an upgrade the peer asked for                                       |
| `cancelVideoUpgrade(callId)`                                 | Withdraw an upgrade request before the peer answers                        |
| `getCall(callId)`                                            | One call or `null`                                                         |
| `getCalls()`                                                 | All tracked calls                                                          |
| `on` / `off` / `once`                                        | Manager-level events                                                       |

Plugin options: `maxConcurrentCalls?: number` (default `1`), `logLevel?: LogLevel` (caps VOIP diagnostics; defaults to the host client's level), `useOriginalRelayPort?: boolean` (default by session, see below), `participantAudio?: boolean` (default `false`; emits `voip_call_participant_audio`).

## Mute

`setMute(callId, muted)` stops your own capture and sends the peer a `<mute_v2>` carrying the new
state, which is what draws a mic-off indicator on the other side. Capture keeps ticking and feeds
silence, so the stream and its SSRC stay alive and unmuting takes effect on the next frame. Incoming
announcements land on `voip_call_peer_mute` and on `call.stateData.peerAudioMuted`.

Muting **another** participant is a different mechanism, carried by the same stanza under a second
attribute, and only exists on group calls: `requestParticipantMute(callId, participantJid)` asks,
and a request to this side arrives on `voip_call_mute_requested` without muting anything. A
request on a 1:1 call is dropped, as WhatsApp's own clients drop it. See
[In-call features](#in-call-features).

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

A relay can be reached on the web client port (3480) or on the port its `<te2>` endpoint advertises, and the wire does not say which one answers. Measured: a companion's legs open only on the advertised port, a mobile primary's only on 3480. So `useOriginalRelayPort` defaults to `true` on a companion and `false` on a mobile primary, read per call, and an explicit value wins.

Either way, a leg that does not open within 5 s, or opens and gets no answer within 4 s, is redialled once on the other port, when there is one: an endpoint that already advertises 3480 has none.

```ts
plugins: [voipPlugin({ useOriginalRelayPort: true })]
```

## Codec

MLow runs through **`libmlow-wasm-fork`** (≥ 0.2.0): 16 kHz, mono, 960-sample frames (60 ms), `useSmpl: true`, DTX enabled. No `koffi`, no bundled native libraries. With `mlowRed` off, when the call's `<voip_settings>` carry `rc.maxfpp` 2 on the 60 ms `frame_ms`, up to two consecutive speech frames go out per packet, as the official 1:1 client sends them; a frame with the VAD bit clear, or the one left waiting when capture pauses, goes alone. With `mlowRed` on, each packet carries the low-rate copy of the previous frame, when there is one, then the frame, stamped with the copy's timestamp, and DTX is off.

```ts
plugins: [
    voipPlugin({
        // WhatsApp's MLow Companion weights (`mlow_companion_v1.pte`), not shipped: bytes or a path
        mlowCompanionModel: '/models/mlow_companion_v1.pte',
        // Off by default; turning it on turns DTX off
        mlowRed: false
    })
]
```

The Companion is the neural post-filter WhatsApp runs in its decoder. Measured on `libmlow-wasm-fork` 0.2.0 it reshapes the 60 ms frames of a 1:1 call too, although the library documents it for 20 ms ones, at about 40 times the decode CPU. Weights that fail to load leave calls decoding without it, with a warning. With remote media both options belong to the host's `WaCallMediaReceiver`.

The signaling and media stack (RTP/SRTP, SCTP relay, codec, audio engine) is internal to the package; use `client.voip` and the events above.

## Credits

The VOIP plugin was built by:

- [@vinikjkkj](https://github.com/vinikjkkj)
- [@edgardmessias](https://github.com/edgardmessias) — Edgard Lorraine Messias
- [@w3nder](https://github.com/w3nder) — Wender Teixeira

## License

MIT
