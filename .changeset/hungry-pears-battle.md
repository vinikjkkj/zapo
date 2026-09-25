---
'@zapo-js/voip': minor
---

Read the peer's screen-share state. The `screen_share` and `screen` payloads of a
`<call>` stanza were acked and dropped, so a peer starting or stopping a share was
invisible. Both are now parsed into `call.peerScreenShare` and emitted as
`voip_call_screen_share`, with `WA_SCREEN_SHARE_STATE` and `WA_SCREEN_SHARE_VERSION`
for the values that travel. Receive only: this client reads the state and starts no
share of its own, so nothing new goes on the wire.

`InboundVideoFrame` gained an `ssrc` field. From screen-share version `V3` on, a
sharing peer sends screen and camera at the same time as two H.264 streams on the
same payload type, and until now `voip_call_inbound_video` interleaved their frames
with no way to tell them apart. Reassembly was already per stream; the SSRC is what
was missing to route the frames.
