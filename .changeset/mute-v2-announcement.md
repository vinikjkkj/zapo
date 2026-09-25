---
'@zapo-js/voip': minor
---

Announce and observe the microphone state on a call.

`setMute` now sends the peer a `<mute_v2>` carrying the new state on top of
stopping capture, so the other side can render a mic-off indicator, and it
returns a promise that settles once the stanza is out. A redundant toggle, a
call that is not active and an unknown call id all send nothing.

An inbound `<mute_v2>` is no longer answered with a fixed unmuted state. It is
parsed instead: the announced state lands on `call.stateData.peerAudioMuted`
and on the new `voip_call_peer_mute` event, once per change. A stanza that
carries `request-state` (one participant asking another to mute, a group-call
mechanism) and one sent by another device of the same account are both logged
and ignored.
