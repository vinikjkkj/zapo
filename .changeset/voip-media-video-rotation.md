---
'@zapo-js/voip-media': minor
---

Expose the sender's rotation on each inbound video frame (`InboundVideoFrame.rotation`, 0..3), read from the low two bits of the id3 frame-info RTP extension; `null` when the packet that completed the frame carries none.
