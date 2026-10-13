---
'@zapo-js/voip': minor
---

Stay on group calls the way the official clients do, and leave them cleanly when the server takes this side off.

A group call now sends the call a heartbeat while this side is on it, every 10 s by default (`heartbeat_interval_s`), and reports to the server a member none of whose media has reached this side for about 20 seconds (`peer_state`, invisible), as every member does. When the server takes this side off a call for the same reason (`user_invisible`), the call ends here at once with the new `EndCallReason.Invisible` instead of staying active with no media, nothing is sent, and the call can be joined again with `joinCall`.
