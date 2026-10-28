---
'@zapo-js/voip-media': patch
---

Decode and answer a peer that sends standard Opus on PT 120 instead of SMPL.

Some clients fall back from SMPL to standard Opus on PT 120, in 60 ms SILK wideband frames (`0x58`) and two-frame 120 ms packets (`0x59`, `0x5a`). The SMPL decoder read each of them as one 120 ms SMPL frame and played 1920 samples of silence per packet, twice the audio the RTP clock advanced, so the playout overflowed and the call was silent both ways. The decoder now tells the two apart by the timeline: the step between packets matches the span of only one reading of the TOC, and after three such steps in a row it switches `OPUS_SET_USE_SMPL` off (and back on if the peer returns to SMPL). The encoder follows: standard Opus frames, one per packet since the repacketizer only builds SMPL multiframes, and no in-band RED. `opusPacketSamples` reads a packet's span as standard Opus. `MLowCodec.peerSendsPlainOpus` and `MLowCodec.plainOpusActive` report the state.
