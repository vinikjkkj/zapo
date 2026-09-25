---
'@zapo-js/voip': minor
---

Turn an audio call into a video call, from this side.

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
