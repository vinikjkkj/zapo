# @zapo-js/voip

## 1.0.0

### Major Changes

- Initial release: WhatsApp VOIP (calling) plugin for `zapo-js`. Registers on
  `WaClient` via `voipPlugin()` and exposes the calling API at `client.voip`.
- MLow voice codec through `libmlow-wasm` (WASM, no native build step or bundled
  binaries).
- Full media stack: `<call>` signaling, RTP/SRTP, STUN, WebRTC/SCTP relay
  transport, and audio engine.
- Pre-recorded outbound audio (`loadAudio`) and live 16 kHz mono PCM
  (`feedLiveAudio`).
- Multi-call support with per-call `CallMediaSession` instances and
  `maxConcurrentCalls` (default `1`). Extra incoming offers wait with
  `canAccept: false` until a slot frees.
- Incoming `<call>`, call-class `<ack>`, and call `<receipt>` handlers are
  registered automatically (prepend, no double-ack).
- Requires `zapo-js@^1.0.0` and `libmlow-wasm`. Optional peers: `@roamhq/wrtc`
  (SCTP relay for real calls), `fluent-ffmpeg` (file decode for `loadAudio`).
