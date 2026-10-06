---
'@zapo-js/voip': patch
---

Pick the relay port from the session type by default.

Measured: a companion session opens its relay legs only on the port the offer advertises, never on 3480, and a primary (mobile) session only on 3480. `useOriginalRelayPort` now defaults to `true` for a companion and `false` for a primary, resolved for each call; passing the option still overrides it.
