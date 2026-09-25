---
'@zapo-js/voip': minor
---

Receive and send emoji reactions during a call.

A reaction is not a call stanza: it rides the call's own media socket as an RTP
packet on the app-data stream, protected with the same per-jid end-to-end key as
the audio, so it needs no second transport. Inbound reactions surface as
`voip_call_reaction` and `client.voip.sendReaction(callId, glyph)` sends one.

The RTP payload type of that stream is not negotiated - each side registers its
own and the offer carries none - so this one is chosen rather than matched, and a
reaction leaves on the first call without waiting to see an inbound packet. The
type a peer stamps on its own stream is recorded as information only, because
inbound app data is recognized by its SSRC.
