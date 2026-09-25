---
'@zapo-js/voip': minor
---

Receive and send emoji reactions during a call.

A reaction is not a call stanza: it rides the call's own media socket as an RTP
packet on the app-data stream, protected with the same per-jid end-to-end key as
the audio, so it needs no second transport. Inbound reactions surface as
`voip_call_reaction` and `client.voip.sendReaction(callId, glyph)` sends one.

The RTP payload type of that stream is chosen per call and is not carried
anywhere this package reads, so the stream learns it from the first inbound
app-data packet and holds its own sending closed until then.
