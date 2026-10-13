---
'@zapo-js/voip': minor
---

Mute, raise hand, reactions, video and screen share on group calls, each attributed to the participant's device.

`voip_call_peer_mute`, `voip_call_peer_video_state`, `voip_call_screen_share`, `voip_call_reaction`, `voip_call_inbound_video` and `voip_call_inbound_video_rtp` carry the sending device in `participantJid`, and the manager-level events take it as a trailing argument, so existing listeners keep working. New events: `voip_call_mute_requested` (a participant asked this side to mute; nothing is applied), `voip_call_participant_media` (a participant's media started or stopped arriving), `voip_call_video_upgraded` (a participant turned the call into a video call) and, with the new `participantAudio` option, `voip_call_participant_audio`. New methods: `requestParticipantMute`, `setVideoEnabled`, `setVideoSubscriptions` and `joinCall`, and `requestVideoUpgrade` on a group call asks the server to turn the whole call into a video call. `groupSenderId`, `WA_MUTE_REQUEST_STATE`, `WA_VIDEO_QUALITY` and the `CallVideoSubscription` type are exported.

A screen share start or stop now carries `screen_share_id`, counted per call from 1, as the official clients send it. A group callee now preaccepts and declines to the call itself, the decline with `count='0'`, so the others list it as invited instead of still ringing. A 1:1 call that grows into a group call by inviting this side is answered as a group call, although its offer names no group. `group_call_ended` ends a group call in any state; the server ending our unanswered ring ends the call here with `EndCallReason.Timeout` and sends nothing, and a re-ring of a call declined or rung out here arrives as a new incoming call.

`joinCall(callId)` joins a group call in progress that this side declined, let ring out or left: one accept to the call itself, with the relay and the rekey coming in the server's answer, whose ack is matched to the call by the address it comes from. `joinable` no longer marks a call as a group call, since WhatsApp Web offers its 1:1 calls joinable too: such a call keeps the 1:1 rules and is never remembered for a join.
