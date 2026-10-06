---
'@zapo-js/voip': patch
---

Key 1:1 calls on the device that is really on the call, and end incoming calls on every terminate the caller sends.

A caller now takes the answering device from the `<accept>` (its `<relay><participant>`, or the sender) instead of the first companion listed for the peer, so audio and video reach it when the peer answers on a device other than that one. On an incoming call, a terminate from the caller always ends it, even after this device accepted and lost the race to another device of the account: as `AcceptedElsewhere` or `RejectedElsewhere` when it carries that reason, and as `UserEnded` otherwise, `device_switch` included. A terminate that lands while the offer is still being decrypted keeps the call from ringing at all. An `<accept>` from another account no longer ends an incoming call, and a call that ends before it was announced emits no `call_state` or `call_ended`.
