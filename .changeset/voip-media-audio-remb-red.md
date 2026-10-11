---
'@zapo-js/voip-media': patch
---

Send a REMB on the peer's audio stream, and keep MLow RED on the layout the official clients accept.

The peer's audio quality control stayed in its 15 kbps probing state for the whole call, because it only leaves it on a REMB received on the audio stream. `WaCallMediaPlane` now sends one (PSFB 206, FMT 15) once per RTCP interval, from its audio SSRC on the peer's: 24 kbps at first, up to a steady 30 kbps on a clean stream, down on loss to 16 kbps at least. `vid_rc.disable_rtcp_remb` still applies to the video one only.

With `mlowRed` on, RED stays the copy-first multiframe stamped on the copy, which WA Web takes without any negotiation. The official in-band layout, a compact RFC 2198 of `[0x80 | 10 ms steps back][length]` per copy, a `0x00` primary header, the copies then the frame, stays internal: an official client takes it only on PT 121 and behind its RX gate (`enable_red_pt_support_rx`), which the server sets, and rejects it on PT 120. `MLowCodec.decodeSequenced` reads the copy-first multiframe on either payload type and the in-band layout on PT 121, playing a copy only in the slot of a lost packet.
