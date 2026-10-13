---
'@zapo-js/voip': minor
---

Read every applied `<voip_settings>` key in one place, and stop copying inbound audio nobody listens to.

`WaVoipSettings` exposes each key the call applies as a typed field, read once when the settings are parsed: besides `disableRtcpRemb`, `rtcpIntervalMs`, `audioFrameMs` and `audioMaxFramesPerPacket`, now `videoStateTxnRecvEnforce`, `heartbeatIntervalMs`, `appDataStream`, `appDataStreamVersion`, `sframe` and `sframeRx`. `getFlag`, `getNumber` and `getText` are unchanged.

`RelayData.hbhKey` is removed: the relay forwards the end-to-end SRTP unchanged, so the hop-by-hop key was parsed and never used.

`InboundVideoFrame` and `InboundVideoRtpPacket` are now the `@zapo-js/voip-media` types, which also carry the optional `senderId` of the stream.

Decoded call audio is copied for `voip_call_inbound_audio` only while the client has a listener for it, including one added after the call started. On a group call, the SSRCs and SRTP keys of every participant are derived once per call key instead of on every roster change. Call ids come from a cryptographically secure random source, in the same 32-character upper-case hex form. The group-call participant type is `WaCallGroupParticipant`.
