---
'@zapo-js/fake-server': minor
---

Serve the WhatsApp Mobile transport and the companion-hosting side of a primary.

The server only spoke WebSocket, so a client connecting in mobile mode (which
dials `tcp://host:port` with its own socket) could never reach it, and the `md`
stanzas a phone sends as a primary had no handlers at all.

- `{ tcp: true }` starts a raw-TCP listener beside the WebSocket one, with the
  address on `server.tcpUrl`. Both listeners share one server identity, session
  model, and IQ router; the socket is now reached through a small carrier
  interface, with each transport's quirks in its own adapter.
- `seedFakeMobilePrimary(store, sessionId, { phoneNumber })` seeds the
  registered credentials a phone session needs, since mobile registration
  happens out of band.
- `offerCompanionPairing(pipeline)` offers a companion the refs for a
  primary-driven link. The primary's `pair-device` upload mints the device jid,
  relays the signed identity to the companion as `pair-success`, and answers
  with `<device jid>` plus the companion's props.
- The pairing-code handshake is relayed end to end (`companion_hello` /
  `primary_hello` / `companion_finish`), and `key-index-list` republishes are
  recorded.
- `remove-companion-device` now distinguishes a primary unlinking a hosted
  device from a companion logging itself out.
- `pushAccountSyncDevices(pipeline)` pushes the account's device set, plus
  builders for the registration-code and account-takeover notifications.
- The Noise handshake mixes back the prologue the client actually sent instead
  of a hardcoded one, and `parseClientPayload` reports whether a login is web or
  mobile along with the phone identity it advertised.

`WaFakeConnection` now takes a carrier adapter instead of a `ws` socket; use
`createWebSocketAdapter` / `createTcpSocketAdapter` if you construct one
directly. IQ responders receive an optional context argument carrying the
connection the stanza arrived on.
