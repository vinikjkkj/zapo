---
'@zapo-js/voip-media': patch
---

Follow the peer to another relay, and leave out relays that stop answering.

When the leg carrying our media dies on one side only, the other side kept sending to the old relay and this side heard nothing for the rest of the call. Our media now moves to the leg the peer's authenticated packets arrive on once the current one has been silent for 400 ms, a relay that leaves a ping unanswered for four seconds is left out of the election until it answers again, and a leg that carries our media but hears none of the peer's for five seconds hands it to a leg of another relay until it hears the peer. Relays are pinged every five seconds while the call sets up and every second once media flows.
