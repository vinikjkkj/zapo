---
'@zapo-js/voip': minor
---

Read the peer's screen-share state. The `screen_share` and `screen` payloads of a
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
