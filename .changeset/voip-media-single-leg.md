---
'@zapo-js/voip-media': patch
---

Send call media on one relay leg instead of all of them.

Every RTP, RTCP and app-data packet went out on every open relay leg, so the peer received each one several times and dropped the copies as SRTP replays, and the uplink cost several times what it should. Media now goes through `WaSctpRelay.sendMedia` on a single leg; the other legs only carry STUN and keepalives. The call stats add `srtpReplays`, `srtpAuthFailures` and `srtpOtherErrors`, and `srtpErrors` stays their sum.
