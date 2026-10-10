# @zapo-js/voip

## 1.2.1

### Patch Changes

- Require `@zapo-js/voip-media` 0.1.2, whose H.264 key frames a phone answering our video call can render.

## 1.2.0

### Minor Changes

- 7914861: Add in-call raise hand: `client.voip.setHandRaised(callId, raised)` announces the local state over the `<user_action>` signalling stanza, incoming announcements land in `CallInfo.raisedHands` and fire `voip_call_hand_raise`. Both directions are idempotent, so a repeated state changes nothing.

    Incoming hands are read in both of the shapes that travel. A peer chooses between a `<user_action action='raise_hand'>` envelope and an older top-level `<raise_hand>` by a gate this side cannot see, and the two are separate message types, so the second one used to fall through the router and vanish. It is now routed, parsed and acked under its own type, and reaches the same state and the same event as the first.

- 7914861: Read the peer's screen-share state. The `screen_share` and `screen` payloads of a
  `<call>` stanza were acked and dropped, so a peer starting or stopping a share was
  invisible. Both are now parsed into `call.peerScreenShare` and emitted as
  `voip_call_screen_share`, with `WA_SCREEN_SHARE_STATE` and `WA_SCREEN_SHARE_VERSION`
  for the values that travel. Nothing is answered: the state is an announcement, and
  the picture arrives as ordinary H.264 on the sender's video stream, which the
  receive path already handles.

    `InboundVideoFrame` gained an `ssrc` field, the stream a frame was assembled from, so
    frames of two senders no longer interleave unmarked on `voip_call_inbound_video`. It
    does **not** tell a peer's camera from its screen: a share derives the same SSRCs the
    camera does, and `CallInfo.peerScreenShare` is the only thing that says the peer is
    sharing.

- 7914861: Announce and observe the microphone state on a call.

    `setMute` now sends the peer a `<mute_v2>` carrying the new state on top of
    stopping capture, so the other side can render a mic-off indicator. It stays
    `void` at every layer: the stanza leaves fire-and-forget and a failed send is
    only logged, since the microphone is off either way. A redundant toggle, a call
    that is not active and an unknown call id all send nothing. The same state is
    also announced once just after the call goes active, which is what gives the
    peer something to show on a call that is never muted.

    An inbound `<mute_v2>` is no longer answered with a fixed unmuted state. It is
    parsed instead: the announced state lands on `call.stateData.peerAudioMuted`
    and on the new `voip_call_peer_mute` event, once per change. A stanza that
    carries `request-state` (one participant asking another to mute, a group-call
    mechanism) and one sent by another device of the same account are both logged
    and ignored.

- 7914861: Receive and send emoji reactions during a call.

    A reaction is not a call stanza: it rides the call's own media socket as an RTP
    packet on the app-data stream, protected with the same per-jid end-to-end key as
    the audio, so it needs no second transport. Inbound reactions surface as
    `voip_call_reaction` and `client.voip.sendReaction(callId, glyph)` sends one.

    The RTP payload type of that stream is not negotiated - each side registers its
    own and the offer carries none - so this one is chosen rather than matched, and a
    reaction leaves on the first call without waiting to see an inbound packet. The
    type a peer stamps on its own stream is recorded as information only, because
    inbound app data is recognized by its SSRC.

- 7914861: Add outgoing screen share: `client.voip.setScreenShare(callId, sharing)` announces the share on a `<screen_share>` request, keeps the local state on `CallInfo.stateData.screenSharing`, and refuses a group call or a call that carries no video, which WhatsApp's own clients refuse to share in. That request is the whole of what goes out - four attributes wide, no geometry and no second state node.

    The share travels on the video stream the call already has, on the same SSRCs and the same payload type, so what changes is only what the peer is told the picture is: the screen replaces the camera for as long as the share lasts, which is the mechanism of the announced version (`WA_SCREEN_SHARE_SEND_VERSION`, `V2`). No media path and no relay registration changes when a share starts, and whatever is fed to `feedLiveVideo` during one is what the peer renders as the screen.

    A screen share has no SSRC space of its own: its streams derive from the same call id, device jid, stream index and slot as the camera's, so a screen stream and the camera stream of the same index are the same number. The stream layers of the wire descriptor (`8` and `9`) are not stream indices and are now documented and tested as such - deriving from them yields an SSRC the peer resolves to nothing and drops without reporting.

- 7914861: Turn an audio call into a video call, from this side.

    `client.voip.requestVideoUpgrade(callId)` negotiates the upgrade as the
    handshake it is: the request leaves as `UpgradeRequestV2`, the 1:1 code, no
    video RTP leaves before the peer has accepted, and the wait is bounded by the
    same five-second guard timer the peer runs. It resolves with the outcome, and
    the ways of not getting video stay apart from one another: `rejected` is a
    person declining, `rejected_by_timeout` is nobody answering, `error` is the
    peer failing to upgrade, and `timeout` is silence, which says nothing about
    whether the request was ever seen. `acceptVideoUpgrade`, `rejectVideoUpgrade`
    and `cancelVideoUpgrade` cover the other three moves.

    Accepting opens the local video sender on a call negotiated as audio: the RTP
    session and the video stream SSRCs the relay has to know about, neither of
    which an audio call has. It then announces that camera to the peer, which is
    its own `<video>` and not part of the accept - without it the peer is told the
    upgrade was accepted and never told the video went live.

    The `state` of a `<video>` is now named rather than raw. `WA_VIDEO_STATE` is
    exported and its values are the wire numbers themselves - the wire carries the
    ordinal of that enum with no translation on either side, which the peer's own
    serializer and the current WhatsApp Web build independently agree on. The
    earlier reading that `6` meant "video enabled" was wrong: it is `Stopped`, and
    the capture that appeared to show an inverted enum was two messages from two
    different senders. `parseVideoStateNode` also reads `enc` and `enc_supported`
    now, so the peer's encoder codec and its decode capability no longer get
    collapsed into the single `dec` field.

- 87dd5b0: End incoming calls settled on another device of the account cleanly. A `<terminate>` with `accepted_elsewhere` or `rejected_elsewhere` now ends the call with the new `EndCallReason.AcceptedElsewhere` or `EndCallReason.RejectedElsewhere` instead of `UserEnded`, and an `<accept>` on a call this device is receiving (another device answering) ends it as `AcceptedElsewhere` without sending anything, instead of running the outgoing-call accept flow and ringing until the call times out.
- 999bd43: Carry call media on `@zapo-js/voip-media`, and let it run outside this process.

    The media of a call - the relays, SRTP, RTP/RTCP, the codec and the jitter
    buffer - now lives in `@zapo-js/voip-media`, a new package with no dependency on
    `zapo-js` or Node that runs in a browser as well. `@zapo-js/voip` keeps the
    signaling and derives the media plan from it: the relays, the SSRCs, the SRTP
    keys and the server's settings. Local calls behave as before.

    `voipPlugin({ media: { mode: 'remote' } })` carries no media here at all. Every
    change to a call's plan leaves as the new `voip_call_media` event, for a host
    elsewhere - typically the browser of whoever answers - to apply with
    `WaCallMediaReceiver`, and that host's events come back through
    `client.voip.media.handleEvent`. `client.voip.media.snapshot(callId)` hands a
    late host the whole plan. The server then needs neither `@roamhq/wrtc` nor
    `libmlow-wasm-fork`, which are now optional peers, and `@roamhq/wrtc` is loaded only
    when a call first dials a relay.

    The codec now comes from `libmlow-wasm-fork` (`^0.2.0`) instead of
    `libmlow-wasm`: the same API and encoder controls, with a browser build that
    carries no Node-only import, so a browser bundler takes it as it is. Install
    `libmlow-wasm-fork` where you installed `libmlow-wasm`.

- Add a raw UDP relay transport behind the `useRawUdpTransport` option, off by default.

    With it on, each relay leg talks to its relay over a plain connected UDP socket - no ICE, DTLS or SCTP - and dials the port the relay advertises; SRTP and the jitter pipeline are unchanged. A raw leg whose relay stops forwarding media for ten seconds ends itself. With the option off nothing changes.

    A call that loses its last relay leg, with none left open or still dialling, now ends with the new `EndCallReason.RelayLost` and tells the peer, instead of staying alive with no media path. The accept's `<video>` also advertises the decoder codec (`dec`), which the peer reads to pick the codec it encodes for us.

- Send the receiver bandwidth estimate where WhatsApp reads it, and allocate IPv6 relay legs.

    Inbound video arrived at about 28 kbps and under one frame per second, with no key frame, because the peer never heard our bandwidth estimate: WhatsApp reads it from an RTP header extension (id 13) inside the video stream, not from REMB over RTCP. That extension now goes out once per frame, and REMB over RTCP follows the server's `disable_rtcp_remb`, read from the `<voip_settings>` node that was never parsed before, along with `rtcp_interval_ms`. IPv6 relay legs now allocate instead of failing with 452, since `XOR-RELAYED-ADDRESS` is encoded for IPv6.

    Media fixes ride along: the Reed-Solomon FEC stream no longer reaches the H.264 depacketizer, three depacketizer defects that dropped or merged frames are fixed, H.264 is packetized per RFC 6184, and inbound SRTCP is unprotected behind a per-SSRC replay window instead of dropped. The `<accept>` no longer carries a spurious `<enc>` that made the server discard it, and the SSRC derivation is back on the formula the wire agrees with.

### Patch Changes

- fa528f1: Key 1:1 calls on the device that is really on the call, and end incoming calls on every terminate the caller sends.

    A caller now takes the answering device from the `<accept>` (its `<relay><participant>`, or the sender) instead of the first companion listed for the peer, so audio and video reach it when the peer answers on a device other than that one. On an incoming call, a terminate from the caller always ends it, even after this device accepted and lost the race to another device of the account: as `AcceptedElsewhere` or `RejectedElsewhere` when it carries that reason, and as `UserEnded` otherwise, `device_switch` included. A terminate that lands while the offer is still being decrypted keeps the call from ringing at all. An `<accept>` from another account no longer ends an incoming call, and a call that ends before it was announced emits no `call_state` or `call_ended`.

- 808f920: Fix silent or one-way audio on incoming calls: accepting now subscribes to and keys SRTP for the device the offer came from instead of a companion device of the peer, and `relaylatency` is answered only for relays this client holds, with its own latency, instead of echoing the peer's back.
- 999bd43: Stamp call audio and video on one media clock, and keep the audio clocks at real time.

    WhatsApp Web paces the video it plays against the audio by subtracting the two
    RTP timestamps, and it holds that difference in microseconds in a signed 32-bit
    integer. Our audio counted from a random point of the 32-bit space and our video
    from near zero, so the difference overflowed it, and in about half the calls the
    receiver read the video as ahead of the audio and held it for good: the picture
    froze, with no log and no key-frame request. Both streams are now stamped on one
    clock per call, started near zero and anchored on the instant the media was
    captured.

    The audio engine's capture and playout clocks moved one chunk per `setInterval`
    tick, and timers fire late and coarse, so both ran at 70-90% of real time: less
    audio left than the call lasted, and inbound audio piled up in the jitter buffer
    until it dropped seconds of it. Each clock now moves every chunk the elapsed time
    owes, up to four per tick, and a longer stall is forgiven rather than replayed.

- 999bd43: Keep a playout pull that throws from taking the process down, and time the video hold on a monotonic clock.

    The audio engine's playback timer pulled each block from the media without a
    guard, so a pull that threw escaped the timer callback as an uncaught exception
    and ended the process. It now costs that block alone, as a failing sink already
    did. The hold on our video until the peer can receive it now measures the time
    held on `performance.now()`, so a wall-clock change mid-call no longer skews the
    time it logs.

- fa528f1: Pick the relay port from the session type by default.

    Measured: a companion session opens its relay legs only on the port the offer advertises, never on 3480, and a primary (mobile) session only on 3480. `useOriginalRelayPort` now defaults to `true` for a companion and `false` for a primary, resolved for each call; passing the option still overrides it.

- fa528f1: Stop answering `<relaylatency>`.

    Every report received was answered with one of ours, so two clients that both answer looped for the whole call, sending several reports a second. A received report is now only read, and our own report names each relay once per call.

- 999bd43: Hold our video until the peer can receive it.

    WhatsApp Web sets up the stream for our video some time after the accept, and a
    first packet that reaches it before that stream exists leaves our video at its
    key frames alone for the rest of the call. Our frames now wait for the peer. On
    an upgrade the peer asked for, they are held until it turns its own camera on
    (`WA_VIDEO_STATE.Enabled`) and 300 ms more, or three seconds at most; an upgrade
    this side asked for is not held. On a call that is video from the start, ours or
    the peer's, they are held from the accept until the peer's first `<mute_v2>` and
    150 ms more, or two seconds at most. `feedLiveVideo` returns `0` while held, and
    the stream opens on the first key frame fed after.

- Updated dependencies [808f920]
- Updated dependencies [fa528f1]
- Updated dependencies [fa528f1]
- Updated dependencies [fa528f1]
    - @zapo-js/voip-media@0.1.1

## 1.1.0

### Minor Changes

- cfd4b9d: Dial relays on the web client port. `connectRelays` pinned every relay
  connection to 3478, which WhatsApp Web names `FAUX_WEB_CLIENT_RELAY_PORT` and
  never dials: a relay reached there completes the handshake and accepts the
  uplink, but never forwards the peer's stream back, so the call is silently one
  way. The port is now `TRUE_WEB_CLIENT_RELAY_PORT` (3480), the value the package
  already carried as the fallback in `configureRelays`.

    New `useOriginalRelayPort` plugin option, default `false`, dials the port each
    endpoint advertises instead. WhatsApp Web gates the same choice behind
    `shouldUseOriginalRelayPort`; without it a relay is only ever reachable on one
    fixed port, however the `<te2>` block addresses it.

- b1aab5d: Add bidirectional WhatsApp video calls with H.264 RTP packetization, inbound frame assembly, RTCP feedback, and public video media events.

### Patch Changes

- a90a53e: Surface the caller phone JID (`caller_pn`) from incoming call offers on the emitted
  call state, so a caller identified by a LID can be matched to their phone number.
  Media derivation is unchanged: the peer SSRC and the SRTP keys stay on the LID device
  JID, which is what the peer derives from.
- f51d2d9: Increase the live audio buffer headroom to absorb upstream jitter without dropping recent speech.

## 1.0.0

### Major Changes

- Initial release: WhatsApp VOIP (calling) plugin for `zapo-js`. Registers on
  `WaClient` via `voipPlugin()` and exposes the calling API at `client.voip`.
- MLow voice codec through `libmlow-wasm` (WASM, no native build step or bundled
  binaries).
- Full media stack: `<call>` signaling, RTP/SRTP, STUN, WebRTC/SCTP relay
  transport, and audio engine.
- Pre-recorded outbound audio (`loadAudio`) and live 16 kHz mono PCM
  (`feedLiveAudio`).
- Multi-call support with per-call `CallMediaSession` instances and
  `maxConcurrentCalls` (default `1`). Extra incoming offers wait with
  `canAccept: false` until a slot frees.
- Incoming `<call>`, call-class `<ack>`, and call `<receipt>` handlers are
  registered automatically (prepend, no double-ack).
- Requires `zapo-js@^1.0.0` and `libmlow-wasm`. Optional peers: `@roamhq/wrtc`
  (SCTP relay for real calls), `fluent-ffmpeg` (file decode for `loadAudio`).
