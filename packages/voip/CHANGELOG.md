# @zapo-js/voip

## 1.0.0

### Major Changes

- Initial release: native WhatsApp VOIP (calling) engine for `zapo-js`. Provides
  the MLow voice codec (via `koffi`), RTP/SRTP, STUN and the WebRTC/SCTP relay
  transport, plus a `VoipSocket` adapter seam and `<call>` stanza routing helpers.
  Supports pre-recorded and live audio calls. Requires `zapo-js@^1.0.0`.
