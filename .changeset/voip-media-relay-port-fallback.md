---
'@zapo-js/voip-media': patch
---

Redial a silent relay leg once on the other port.

A leg that does not open within five seconds, opens and hears nothing from its relay within four, or dies before its first answer, is dialled again on the other port (3480 or the one the offer advertises), so a call still connects when the dialled port does not fit the relay. An endpoint that already advertises 3480 has no other port and is not redialled.
