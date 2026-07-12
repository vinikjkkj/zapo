# @zapo-js/mcp-server

## 1.0.4

### Patch Changes

- Wire the dev harness to the new core surface: load `wamPlugin()` so the WAM telemetry plugin is exposed as `client.wam`, and configure per-session companion-host persistence (`createFileCompanionHostPersistence`) so a mobile-primary session keeps its hosted companions across restarts.

## 1.0.3

### Patch Changes

- Capture the new `message_unavailable` event in the buffered event ring.

## 1.0.2

### Patch Changes

- Auto-enable the mobile transport from persisted `deviceInfo`, so a mobile-registered MCP session reconnects in mobile mode without re-passing transport options.

## 1.0.1

### Patch Changes

- Updated dependencies
    - @zapo-js/store-sqlite@1.0.1

## 1.0.0

### Major Changes

- Align with the `zapo-js` 1.0.0 stable release. Now requires `zapo-js@^1.0.0`.

### Patch Changes

- Updated dependencies
    - @zapo-js/store-sqlite@1.0.0
    - @zapo-js/media-utils@1.0.0
