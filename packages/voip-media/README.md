# @zapo-js/voip-media

The media plane of a WhatsApp call: the relay transport, STUN, SRTP, RTP/RTCP, H.264
packetization, the app-data stream and the MLow codec.

It has no dependency on `zapo-js`. The signaling of a call stays on the server with
[`@zapo-js/voip`](../voip); only the media needs to live wherever the audio is, and a browser that
carries a call's media installs this package alone.

| Entry                      | Runs in       | Holds                                                                                                               |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `@zapo-js/voip-media`      | Node, browser | the media plane itself; everything host-specific is injected                                                        |
| `@zapo-js/voip-media/node` | Node          | `node:crypto`, `RTCPeerConnection` on `@roamhq/wrtc`, raw UDP legs                                                  |
| `@zapo-js/voip-media/web`  | browser       | the primitives in plain JavaScript, the browser's `RTCPeerConnection`, audio on an AudioWorklet, video on WebCodecs |

The core never imports either host, and the two hosts never import each other.

## Install

```bash
npm install @zapo-js/voip-media libmlow-wasm-fork
```

`libmlow-wasm-fork` is the codec, a fork of `libmlow-wasm` whose browser build carries no Node-only import, so a bundler takes it as it is. The WASM is embedded in the module, so there is no separate `.wasm` file to serve, and it is only downloaded when a call starts.

## Carrying a call's media

`WaCallMediaPlane` is the media of one call. It knows nothing of signaling: what it needs from
there arrives as a plan, and what signaling needs from here leaves as events.

```ts
import { WaCallMediaPlane } from '@zapo-js/voip-media'
import { webMediaHost } from '@zapo-js/voip-media/web' // or nodeMediaHost from '/node'

const plane = new WaCallMediaPlane({
    ...webMediaHost,
    onActive: () => {
        // media is flowing: accepted, and a relay leg is up
    },
    onRelayLost: (reason) => {
        // no leg left - tell signaling, which ends the call
    },
    onReaction: (reaction) => {
        // an in-band emoji reaction from the peer
    }
})

await plane.start() // loads the codec
await plane.apply(plan) // the plan signaling sent, and every update after it

// On the host's own audio clock, 16 kHz mono:
plane.pushCapture(microphoneSamples)
plane.pullPlayout(speakerBuffer)

plane.stop()
```

The plan (`WaCallMediaPlan`) carries the relays, the SSRCs and the SRTP keys already derived, the
settings the server tuned, whether the call is accepted or muted, and whether video may flow. It
holds no jid and no call key. Every section is replaced whole when it changes, and updates apply
in the order they are handed in.

The audio pace belongs to the host. Capture is pushed in at any length and framed internally;
playout is pulled out of a jitter buffer that pads with silence when it runs short. In Node that
pace is a timer; in a browser, the audio device.

The timestamps belong to the plane: audio and video are stamped on one media clock per call, the
way the receiver needs them to pace the video against the audio. `pushCapture(samples, capturedAtMs)`
takes the `performance.now()` instant the first sample was captured, and without it the block is
taken as captured as it arrives. Consecutive frames keep consecutive timestamps whatever jitter
those instants carry, a pause in the capture goes out as a marked jump, and capture delivered ahead
of the clock is shed. `sendVideoFrame` takes the host's own capture timestamp in any epoch and maps
it onto the same clock.

## Audio in a browser

`WaWebCallAudio` carries that clock for you: it opens the microphone and the speaker and drives
`pushCapture` and `pullPlayout` from one AudioWorklet, with no timers, so a background tab does not
starve the call.

```ts
import { WaWebCallAudio } from '@zapo-js/voip-media/web'

// From the click that answers or dials: it asks for the microphone.
const audio = await WaWebCallAudio.start(plane)

await audio.stop()
plane.stop()
```

The worklet posts 20 ms of captured audio at a time, and each block is answered with the same
amount of playout, so the audio device paces both directions. It prefers a 16 kHz `AudioContext`
and falls back to the device rate, converting in the worklet, where the browser refuses one. A
`microphone` or `audioContext` passed in stays the caller's to stop or close. Under a CSP that
forbids `blob:` scripts, serve `WA_CALL_AUDIO_WORKLET_SOURCE` as a file and pass its URL as
`workletUrl`.

## Video in a browser

The plane carries H.264 access units; the browser's WebCodecs makes and shows them.
`WaWebCallVideoSender` encodes a video track and hands each access unit to the plane, and
`WaWebCallVideoReceiver` decodes the peer's frames as the plane reassembles them.

```ts
import { WaWebCallVideoReceiver, WaWebCallVideoSender } from '@zapo-js/voip-media/web'

const video = new WaWebCallVideoReceiver({
    onFrame: (frame, ssrc) => {
        context2d.drawImage(frame, 0, 0)
        frame.close()
    }
})
const plane = new WaCallMediaPlane({
    ...webMediaHost,
    onInboundVideo: (frame) => video.push(frame)
    // ...
})

const [camera] = (await navigator.mediaDevices.getUserMedia({ video: true })).getVideoTracks()
const sender = await WaWebCallVideoSender.start(plane, camera)

// A screen share replaces the camera on the same stream:
await sender.replaceTrack(screenTrack)

await sender.stop()
video.close()
```

The sender can start with the call: the plane drops every frame until media flows - the call
accepted, with a leg up - and the plan opens video, on a video call or once an upgrade is agreed.
The stream then opens on a key frame - deltas before the first one are refused too, since nothing
could decode them - and while the plane refuses, the sender offers a key frame every half second, so
the stream opens soon after it may.

It encodes Constrained Baseline at up to 1280x720 and 15 fps, scaling a larger source down, with a
key frame at least every two seconds - the plane does not act on the peer's key-frame requests, so
that interval is what bounds how long a lost picture takes to come back. It reads the track through
Chrome's `MediaStreamTrackProcessor`, or, where there is none, by sampling a video element on a
timer that a background tab throttles. Tracks stay the caller's to stop.

The receiver keeps one decoder per stream, configured from each key frame's own parameter set, and
starts a stream, or restarts it after a failure or a backlog, at its next key frame.

## What the host provides

A host is a `WaMediaHost`: the three synchronous primitives SRTP and STUN run on, and a way to
build the peer connection of each relay leg. `nodeMediaHost` and `webMediaHost` are the two
ready-made ones.

| Piece                  | `/web`                               | `/node`                                 |
| ---------------------- | ------------------------------------ | --------------------------------------- |
| `crypto`               | AES-128-CTR, HMAC-SHA1 in JavaScript | `node:crypto`                           |
| `createPeerConnection` | the browser's `RTCPeerConnection`    | `@roamhq/wrtc`, loaded on the first leg |
| `createRawUdpLeg`      | not available                        | `WaRawUdpLeg` on `node:dgram`, opt-in   |
| `logger`               | any object with the methods          | a `zapo-js` `Logger` as it is           |

A browser gets the primitives in JavaScript because WebCrypto only offers them as promises, and
SRTP protects and verifies packet by packet on a path that cannot wait for one. The tests hold both
implementations to the published vectors (FIPS-197, SP 800-38A, RFC 3711, RFC 2202) and to each
other. Randomness comes from `crypto.getRandomValues`, which both hosts have.
