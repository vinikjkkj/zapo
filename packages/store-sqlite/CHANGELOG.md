# @zapo-js/store-sqlite

## 0.3.0

### Minor Changes

- Split `WaSignalStore` into focused providers: `signal`, `preKey`, `session`, `identity`,
  and `messageSecret` stores (breaking for custom backends). Adds new migrations for the
  split tables.
- Harden backend with TTL validation, bounds checks, chunked deletes, and lifecycle fixes.

## 0.2.0

### Minor Changes

- feat: add monorepo structure with optional store packages for SQLite, MySQL, PostgreSQL, Redis, and MongoDB
