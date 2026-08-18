---
'@zapo-js/voip': minor
---

Dial relays on the web client port. `connectRelays` pinned every relay
connection to 3478, which WhatsApp Web names `FAUX_WEB_CLIENT_RELAY_PORT` and
never dials: a relay reached there completes the handshake and accepts the
uplink, but never forwards the peer's stream back, so the call is silently one
way. The port is now `TRUE_WEB_CLIENT_RELAY_PORT` (3480), the value the package
already carried as the fallback in `configureRelays`.

New `useOriginalRelayPort` plugin option, default `false`, dials the port each
endpoint advertises instead. WhatsApp Web gates the same choice behind
`shouldUseOriginalRelayPort`; without it a relay is only ever reachable on one
fixed port, however the `<te2>` block addresses it.
