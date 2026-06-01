# @zapo-js/fake-server

## 1.0.0

### Major Changes

- Align with the `zapo-js` 1.0.0 stable release. Now requires `zapo-js@^1.0.0`.

## 0.3.0

### Minor Changes

- Initial public release. A fake WhatsApp Web server used for end-to-end testing of
  zapo-js: noise handshake, IQ/push routing, fake signal sessions, app-state crypto,
  history sync, prekey upload/fetch, group ops, and a CLI bin (`fake-wa-server`).
- Performance: O(1) device lookup and server profiling in bench harness.
