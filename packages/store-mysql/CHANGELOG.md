# @zapo-js/store-mysql

## 1.0.1

### Patch Changes

- Stop `getOrGenPreKeys` from spinning when generated pre-key ids collide with already-stored ids.

## 1.0.0

### Major Changes

- Align with the `zapo-js` 1.0.0 stable release. Now requires `zapo-js@^1.0.0`.

## 0.3.0

### Minor Changes

- Split `WaSignalStore` into focused providers: `signal`, `preKey`, `session`, `identity`,
  and `messageSecret` stores (breaking for custom backends).
- Fix TEXT fields returned as `Uint8Array` in participants, device-list, and retry stores;
  harden backend with TTL validation, bounds checks, and chunked deletes.

## 0.2.0

### Minor Changes

- feat: add monorepo structure with optional store packages for SQLite, MySQL, PostgreSQL, Redis, and MongoDB
