---
'@zapo-js/voip': minor
---

Add outgoing screen share: `client.voip.setScreenShare(callId, sharing)` announces the share on a `<screen_share>` request, keeps the local state on `CallInfo.stateData.screenSharing`, and refuses a group call or a call that carries no video, which WhatsApp's own clients refuse to share in. That request is the whole of what goes out - four attributes wide, no geometry and no second state node.

The share travels on the video stream the call already has, on the same SSRCs and the same payload type, so what changes is only what the peer is told the picture is: the screen replaces the camera for as long as the share lasts, which is the mechanism of the announced version (`WA_SCREEN_SHARE_SEND_VERSION`, `V2`). No media path and no relay registration changes when a share starts, and whatever is fed to `feedLiveVideo` during one is what the peer renders as the screen.

A screen share has no SSRC space of its own: its streams derive from the same call id, device jid, stream index and slot as the camera's, so a screen stream and the camera stream of the same index are the same number. The stream layers of the wire descriptor (`8` and `9`) are not stream indices and are now documented and tested as such - deriving from them yields an SSRC the peer resolves to nothing and drops without reporting.
