---
'@zapo-js/voip-media': minor
---

Pack two 60 ms MLow frames per audio packet when the peer's `voip_settings` allows it (`maxfpp`), as the official clients do, and decode and encode MLow without allocating per frame. PT 121 audio is kept apart from video FEC. An optional MLow Companion model (the NoLACE post-filter, weights supplied by the host) can run on the decoder.
