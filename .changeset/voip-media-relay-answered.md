---
'@zapo-js/voip-media': patch
---

Report the relays that answer the call's legs.

`WaCallMediaPlane` takes an `onRelayAnswered(name, rttMs?)` callback, fired the first time each relay answers, with the round trip from the leg's first allocate when one went out. `WaCallMediaReceiver` sends it to signaling as a `relay_answered` event, and its `active` event now carries `reportsRelayAnswers: true` so signaling can tell it from an older host. The wire version stays 1: signaling that predates the event ignores it.
