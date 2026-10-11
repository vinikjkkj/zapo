---
'@zapo-js/voip': minor
---

Add the `mlowCompanionModel` and `mlowRed` options, follow the peer's `maxfpp` when packing audio, and stop announcing MLow RED (capability bit 36) in video offers, since this client does not take the official RED format.
