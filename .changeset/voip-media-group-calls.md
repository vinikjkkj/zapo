---
'@zapo-js/voip-media': minor
---

Carry group-call media: a relay the server moves the call to, a decoder per sender, and per-participant keys and attribution.

The media plan gains a `group` section listing every sender with its SSRCs, receive keying material and roster pid. The plane keys SRTP and SRTCP per sender, decodes each one on its own MLow decoder, mixes them for playout, and drops packets from SSRCs the plan doesn't list. Relays come in generations: a newer one is dialled at once, even with legs open. The send stays on the newest generation unless peer media keeps arriving only on an older one, and an older generation is retired once authenticated peer media arrives on the newer one. A relay that only re-issues its credentials is rebound in place, on the same socket or connection. WARP-framed downlink packets are unwrapped, PT 122 audio is decoded as plain MLow on the PT 120 timeline, and the allocate can carry a self-only stream descriptor and an optional video subscription. Reactions, inbound video and a new `sender_media` event name the sender they came from, and a remote host announces what it supports through a `host` event, keeping wire version 1.
