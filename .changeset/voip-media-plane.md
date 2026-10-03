---
'@zapo-js/voip': minor
---

Carry call media on `@zapo-js/voip-media`, and let it run outside this process.

The media of a call - the relays, SRTP, RTP/RTCP, the codec and the jitter
buffer - now lives in `@zapo-js/voip-media`, a new package with no dependency on
`zapo-js` or Node that runs in a browser as well. This package keeps the
signaling and derives the media plan from it: the relays, the SSRCs, the SRTP
keys and the server's settings. Local calls behave as before.

`voipPlugin({ media: { mode: 'remote' } })` carries no media here at all. Every
change to a call's plan leaves as the new `voip_call_media` event, for a host
elsewhere - typically the browser of whoever answers - to apply with
`WaCallMediaReceiver`, and that host's events come back through
`client.voip.media.handleEvent`. `client.voip.media.snapshot(callId)` hands a
late host the whole plan. The server then needs neither `@roamhq/wrtc` nor
`libmlow-wasm-fork`, which are now optional peers, and `@roamhq/wrtc` is loaded only
when a call first dials a relay.

The codec now comes from `libmlow-wasm-fork` (`^0.2.0`) instead of
`libmlow-wasm`: the same API and encoder controls, with a browser build that
carries no Node-only import, so a browser bundler takes it as it is. Install
`libmlow-wasm-fork` where you installed `libmlow-wasm`.
