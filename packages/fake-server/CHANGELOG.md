# @zapo-js/fake-server

## 1.3.0

### Minor Changes

- Accept a `noiseRootCa` derived from a shared seed in `listen()`, so a client in
  another process can pin the trust anchor before the server is listening. Omitting
  the option keeps the previous behavior: a fresh random CA per listen.

## 1.2.0

### Minor Changes

- Serve the WhatsApp Mobile transport and the companion-hosting side of a primary. The server only spoke WebSocket, so a client connecting in mobile mode (which dials `tcp://host:port` with its own socket constructor) could never reach it, and the `md` stanzas a phone sends as a primary had no handlers at all.

    `{ tcp: true }` starts a raw-TCP listener beside the WebSocket one, with its address on `server.tcpUrl`; both share one server identity, session model, and IQ router, reaching the socket through a carrier interface that keeps each transport's quirks in its own adapter. `seedFakeMobilePrimary(store, sessionId, { phoneNumber })` seeds the registered credentials a phone session starts from, since mobile registration happens out of band.

    `offerCompanionPairing(pipeline)` offers a companion the refs for a primary-driven link: the primary's `pair-device` upload mints the device jid, relays the primary-signed identity to the companion as `pair-success`, and answers with `<device jid>` plus the companion's props. The pairing-code handshake is relayed end to end (`companion_hello` / `primary_hello` / `companion_finish`), `key-index-list` republishes are recorded, and `remove-companion-device` distinguishes a primary unlinking a hosted device from a companion logging itself out. Every companion-host stanza is gated on the connection belonging to the phone that owns the session, so a second number cannot link, republish, or revoke against someone else's account.

    `pushAccountSyncDevices(pipeline)` pushes the account's device set, alongside builders for the registration-code and account-takeover notifications. Two fixes fall out of the work: the Noise handshake mixes back the prologue the client actually sent instead of a hardcoded one, and `parseClientPayload` reports whether a login is web or mobile along with the phone identity it advertised. Pairing refs are now minted printable from one place, since a raw random byte could decode into a newline and truncate the QR payload a client pastes back.

    `WaFakeConnection` takes a carrier adapter instead of a `ws` socket (`createWebSocketAdapter` / `createTcpSocketAdapter` build one), and IQ responders receive an optional context carrying the connection the stanza arrived on.

## 1.1.0

### Minor Changes

- Interop with non-zapo-js clients (Baileys forks, whatsmeow) and programmatic server config. The fake Noise cert chain now carries a valid `notBefore`/`notAfter` window (strict clients rejected the 1970 default as expired). Default IQ handlers answer the `passive` set and `encrypt` get `<count>` queries these clients block on before reporting the connection as open, and an `<ib><offline count="0"/></ib>` bulletin is sent after every login so buffered-event clients flush. `FakePeer` default message ids are now WA-style hex (an `@` broke strict binary decoders). The CLI gains a `--pair <jid>` mode that drives QR pairing over stdin, and `--log` no longer clobbers the server's pipeline events. `FakeWaServerOptions` accepts `successNodeAttributes` and `defaultIqHandlers: false`; IQ responders may return `null` to fall through to the next matching handler; `onPipeline` fans out to multiple listeners and returns an unsubscribe; `WaFakeConnectionPipeline` exposes the parsed `clientPayload`.
- Support multiple isolated clients on one server. Pass a `sessionKey` resolver to `FakeWaServer` to bind each authenticated connection to its own session, keyed by the returned id; sessions never share peers, groups, prekeys, app-state, or captured stanzas. New `server.session(id)` and `server.sessionFor(pipeline)` return the isolated `FakeServerSession` (its own `registries`, `preKeyDispenser`, `appStateSync`, IQ router, and `expectIq`/`expectStanza`/capture). `server.createFakePeer(opts, pipeline)`, `triggerPreKeyUpload(pipeline)`, `pushServerSyncNotification(pipeline)`, and `runPairing(pipeline)` all route to the connecting pipeline's session; `server.registerIqHandler(...)` applies to every session while `session.registerIqHandler(...)` scopes to one. Without a `sessionKey` the server keeps a single default session and the existing `server.registries` / `expectIq` / `preKeyDispenser` surface is unchanged.

## 1.0.0

### Major Changes

- Align with the `zapo-js` 1.0.0 stable release. Now requires `zapo-js@^1.0.0`.

## 0.3.0

### Minor Changes

- Initial public release. A fake WhatsApp Web server used for end-to-end testing of
  zapo-js: noise handshake, IQ/push routing, fake signal sessions, app-state crypto,
  history sync, prekey upload/fetch, group ops, and a CLI bin (`fake-wa-server`).
- Performance: O(1) device lookup and server profiling in bench harness.
