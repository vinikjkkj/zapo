---
'@zapo-js/voip': minor
---

Add in-call raise hand: `client.voip.setHandRaised(callId, raised)` announces the local state over the `<user_action>` signalling stanza, incoming announcements land in `CallInfo.raisedHands` and fire `voip_call_hand_raise`. Both directions are idempotent, so a repeated state changes nothing.

Incoming hands are read in both of the shapes that travel. A peer chooses between a `<user_action action='raise_hand'>` envelope and an older top-level `<raise_hand>` by a gate this side cannot see, and the two are separate message types, so the second one used to fall through the router and vanish. It is now routed, parsed and acked under its own type, and reaches the same state and the same event as the first.
