---
'@zapo-js/voip': patch
---

Hold our video until the peer can receive it.

WhatsApp Web sets up the stream for our video some time after the accept, and a
first packet that reaches it before that stream exists leaves our video at its
key frames alone for the rest of the call. Our frames now wait for the peer. On
an upgrade the peer asked for, they are held until it turns its own camera on
(`WA_VIDEO_STATE.Enabled`) and 300 ms more, or three seconds at most; an upgrade
this side asked for is not held. On a call that is video from the start, ours or
the peer's, they are held from the accept until the peer's first `<mute_v2>` and
150 ms more, or two seconds at most. `feedLiveVideo` returns `0` while held, and
the stream opens on the first key frame fed after.
