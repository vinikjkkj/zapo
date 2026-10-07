---
'@zapo-js/voip-media': patch
---

Export `dialableRelayEndpoints`, the rule the media plane picks the relays it dials by, so signaling can answer `relaylatency` for exactly the relays the plane dials.
