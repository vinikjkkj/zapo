---
'@zapo-js/voip': patch
---

Stop answering `<relaylatency>`.

Every report received was answered with one of ours, so two clients that both answer looped for the whole call, sending several reports a second. A received report is now only read, and our own report names each relay once per call.
