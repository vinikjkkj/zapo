---
'@zapo-js/voip-media': patch
---

Play the peer's audio when it arrives on PT 121.

A peer with the separate MLow payload type negotiated sends all of its audio on PT 121, plain MLow frames, and the plane discarded it, so the call went mute. A PT 121 packet that parses as MLow now decodes on the same timeline as PT 120, its sequence numbers kept apart, so a slot both payload types carry plays once. `audioRedDiscarded` counts only the PT 121 packets that do not parse as MLow. `MLowCodec.decodeSequenced` takes an optional `stream` (0 or 1) for the second numbering.
