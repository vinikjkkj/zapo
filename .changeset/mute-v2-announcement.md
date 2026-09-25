---
'@zapo-js/voip': minor
---

Announce and observe the microphone state on a call.

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
