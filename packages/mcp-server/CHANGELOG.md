# @zapo-js/mcp-server

## 1.2.0

### Minor Changes

- 7f7f560: Add `MCP_DEVICE_OS_VERSION` to override the OS version advertised in
  `DeviceProps.version`. Set it alongside `MCP_DEVICE_OS_DISPLAY` when advertising
  an OS the process is not running on, so the advertised name and version agree.

## 1.1.0

### Minor Changes

- 5b673b1: Add `MCP_GROUP_BUNDLES` to opt into downloading the group-history bundles other
  members share, and buffer the resulting `group_history_bundle` events so the
  `events` tool can query them.

### Patch Changes

- 1f0de19: Buffer the core `offline_thread_metadata` event so the `events` tool can query
  it. The subscription list is explicit, so a new core event is invisible to the
  MCP until it is registered there.
- Updated dependencies
- Updated dependencies
    - @zapo-js/store-sqlite@1.1.0

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
