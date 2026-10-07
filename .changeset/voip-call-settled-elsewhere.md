---
'@zapo-js/voip': minor
---

End incoming calls settled on another device of the account cleanly. A `<terminate>` with `accepted_elsewhere` or `rejected_elsewhere` now ends the call with the new `EndCallReason.AcceptedElsewhere` or `EndCallReason.RejectedElsewhere` instead of `UserEnded`, and an `<accept>` on a call this device is receiving (another device answering) ends it as `AcceptedElsewhere` without sending anything, instead of running the outgoing-call accept flow and ringing until the call times out.
