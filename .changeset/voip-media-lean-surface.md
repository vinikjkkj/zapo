---
'@zapo-js/voip-media': minor
---

Narrow the public surface to what a media host uses, and cut the per-packet cost of receiving and sending.

**Breaking.** These exports are gone; the call plane, the web host and the remote-media protocol keep working without them:

- app data: `decodeAppDataPayload`, `encodeReactionPayload`, `WaAppDataStream`, `WaAppDataPayload`, `WaAppDataStreamOptions`
- SRTP: `randomInt`, `SRTCP_AUTH_TAG_LEN`, `SrtcpContext`, `SrtcpSession`, `SRTP_MAX_RECV_CONTEXTS`, `SrtpError`, `SrtpSession`, `SRTP_AUTH_TAG_LEN`, `SRTP_LABEL`, `SRTP_RECV_AUTH_TAG_LEN`, `SRTP_SEND_AUTH_TAG_LEN`
- RTP and RTCP: `RtpHeader`, `RtpPacket`, `RtpSession`, `WA_RTP_EXTENSION_PROFILE`, `PayloadType`, `buildFullIntraRequest`, `buildPictureLossIndication`, `buildReceiverEstimatedMaxBitrate`, `buildSenderReportWithSdes`, `nextAudioReceiverEstimate`, `nextReceiverMaxBitrate`, `RTCP_CNAME_LENGTH`, `RtpStreamReception`, `SenderReportSchedule`, `WA_FAST_REMB_ELEMENT_LENGTH`, `WA_FAST_REMB_EXTENSION_ID`, `writeFastRembExtension`
- H.264: `H264Depacketizer`, `H264AccessUnit`, `packetizeH264AnnexB` (`isH264KeyFrame` stays)
- MLow: `MLOW_ENCODER_CTL`, `MLowCodec`, `MLowCodecOptions`, `MLowCodecStats`, `MLowEncoderTunables`
- clock and buffering: `WaJitterBuffer` (`WaJitterBufferStats` stays), `HostCaptureTimeMapper`, `MEDIA_CLOCK_ORIGIN_LEAD_MS`, `WaMediaClock`
- relay: `isRtcpPacket`, `isRtpPacket`, `isStunPacket`, `TRUE_WEB_CLIENT_RELAY_PORT`, `WaSctpRelay`, `WaSctpRelayOptions`

For code that still reaches the SRTP classes: `unprotect` on `SrtpSession` and `SrtcpSession` returns `null` for a replayed or duplicate packet instead of throwing, `SrtpError['type']` is now only `'packet_too_short' | 'auth_failed'`, and `SrtpSession.setSendAuthKeying` is removed.

`Logger.level` is optional: a logger without it is treated as emitting every level. The new `isLogLevelEnabled(logger, level)` and the `LogLevel` type are exported, and per-packet trace logs are only built when `trace` is enabled.

`WaCallAudioSink.pushCapture` and `WaCallVideoSink.sendVideoFrame` may reuse the buffer they are handed once the call returns: copy `samples` or `data` to keep them.

Receiving costs less: the SRTP replay window no longer uses `BigInt`, session keys are derived once per keying instead of once per SSRC, the browser crypto caches its HMAC and AES key state, PT 121 audio is parsed once, the H.264 depacketizer copies a frame once when it completes, and a group call's mixer skips senders with nothing queued. Sending an H.264 frame scans it once. ICE-disconnect timers and relay-opened data channels are released when a relay leg closes.
