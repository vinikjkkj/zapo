# @zapo-js/voip-media

## 0.1.1

### Patch Changes

- 808f920: Export `dialableRelayEndpoints`, the rule the media plane picks the relays it dials by, so signaling can answer `relaylatency` for exactly the relays the plane dials.
- fa528f1: Follow the peer to another relay, and leave out relays that stop answering.

    When the leg carrying our media dies on one side only, the other side kept sending to the old relay and this side heard nothing for the rest of the call. Our media now moves to the leg the peer's authenticated packets arrive on once the current one has been silent for 400 ms, and a relay that leaves a ping unanswered for four seconds is left out of the election until it answers again. Relays are pinged every five seconds while the call sets up and every second once media flows.

- fa528f1: Redial a silent relay leg once on the other port.

    A leg that does not open within five seconds, opens and hears nothing from its relay within four, or dies before its first answer, is dialled again on the other port (3480 or the one the offer advertises), so a call still connects when the dialled port does not fit the relay. An endpoint that already advertises 3480 has no other port and is not redialled.

- fa528f1: Send call media on one relay leg instead of all of them.

    Every RTP, RTCP and app-data packet went out on every open relay leg, so the peer received each one several times and dropped the copies as SRTP replays, and the uplink cost several times what it should. Only the sending changes: media now goes out through `WaSctpRelay.sendMedia` on a single leg, and the other legs carry only STUN and keepalives outbound. Every leg still receives, and the peer's media arriving on another leg can move our sending there. The call stats add `srtpReplays`, `srtpAuthFailures` and `srtpOtherErrors`, and `srtpErrors` stays their sum.
