---
'@zapo-js/voip-media': patch
---

Send a key frame's SPS and PPS together in one STAP-A packet (RFC 6184), so a phone that answers our video call renders it.

`packetizeH264AnnexB` sent each parameter set as its own single-NAL packet. A phone answering a video call we placed received the stream without loss but never rendered a frame and kept requesting key frames. An SPS directly followed by a PPS now goes out as one STAP-A ahead of the slices, which still use single-NAL or FU-A packets as before. Delta frames, SEI and access units without that pair are unchanged.
