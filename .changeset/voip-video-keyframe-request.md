---
'@zapo-js/voip': minor
'@zapo-js/voip-media': minor
---

Let consumers ask the peer for a video key frame: `client.voip.requestVideoKeyFrame(callId)` (and `WaCallMediaPlane.requestVideoKeyFrame()`) sends a key frame request on every inbound video stream seen so far, paced at 500 ms. A consumer that joins a flowing call, or lost frames after the first key frame, recovers without waiting for the peer's periodic key frame. Returns `false` when no inbound video exists, the media runs remotely, or the previous request is too recent.
