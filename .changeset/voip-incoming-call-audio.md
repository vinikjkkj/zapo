---
'@zapo-js/voip': patch
---

Fix silent or one-way audio on incoming calls: accepting now subscribes to and keys SRTP for the device the offer came from instead of a companion device of the peer, and `relaylatency` is answered only for relays this client holds, with its own latency, instead of echoing the peer's back.
