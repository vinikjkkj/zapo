# @zapo-js/store-mysql

## 0.3.0

### Minor Changes

- Split `WaSignalStore` into focused providers: `signal`, `preKey`, `session`, `identity`,
  and `messageSecret` stores (breaking for custom backends).
- Fix TEXT fields returned as `Uint8Array` in participants, device-list, and retry stores;
  harden backend with TTL validation, bounds checks, and chunked deletes.

## 0.2.0

### Minor Changes

- feat: add monorepo structure with optional store packages for SQLite, MySQL, PostgreSQL, Redis, and MongoDB
