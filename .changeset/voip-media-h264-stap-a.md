---
'@zapo-js/voip-media': patch
---

Send an H.264 key frame in the shape the official WhatsApp clients use, so a phone that answers our video call renders it.

`packetizeH264AnnexB` sent the SPS and PPS of a key frame as their own single-NAL packets, which the Android client discards, so it never rendered a frame and kept requesting key frames. A key frame (an IDR behind an SPS) now goes out whole in one STAP-A when it fits a packet, and otherwise as one FU-A typed SPS that carries the rest of the access unit with its inner start codes. Delta frames and access units without an SPS ahead of their IDR are packetized as before.
