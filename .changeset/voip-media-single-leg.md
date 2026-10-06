---
'@zapo-js/voip-media': patch
---

Send call media on one relay leg instead of all of them.

Every RTP, RTCP and app-data packet went out on every open relay leg, so the peer received each one several times and dropped the copies as SRTP replays, and the uplink cost several times what it should. Only the sending changes: media now goes out through `WaSctpRelay.sendMedia` on a single leg, and the other legs carry only STUN and keepalives outbound. Every leg still receives, and the peer's media arriving on another leg can move our sending there. The call stats add `srtpReplays`, `srtpAuthFailures` and `srtpOtherErrors`, and `srtpErrors` stays their sum.
