---
'@zapo-js/voip': patch
---

Pick the relay port from the session type by default.

A companion session dialling the relays on 3480 never opened a leg, and a primary (mobile) session only opens them on 3480, not on the port the offer advertises: WhatsApp assigns a different relay class to each kind of device. `useOriginalRelayPort` now defaults to `true` for a companion and `false` for a primary, resolved for each call; passing the option still overrides it.
