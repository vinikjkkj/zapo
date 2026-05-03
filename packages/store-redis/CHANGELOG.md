# @zapo-js/store-redis

## 0.3.0

### Minor Changes

- Split `WaSignalStore` into focused providers: `signal`, `preKey`, `session`, `identity`,
  and `messageSecret` stores (breaking for custom backends).
- Harden backend with TTL validation, bounds checks, and chunked deletes.

## 0.2.0

### Minor Changes

- feat: add monorepo structure with optional store packages for SQLite, MySQL, PostgreSQL, Redis, and MongoDB
