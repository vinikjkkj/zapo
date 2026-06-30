# @zapo-js/store-redis

## 1.1.0

### Minor Changes

- Add an optional `storeTtlMs` option for a per-domain key TTL, so cached keys expire automatically.

## 1.0.2

### Patch Changes

- perf(store): write only the index/value delta in setCollectionStates

    Diff against the persisted state and write only the delta (upsert
    changed/new entries, delete removed ones, leave unchanged rows untouched)
    instead of rewriting the entire index_value set on every change.

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
- Harden backend with TTL validation, bounds checks, and chunked deletes.

## 0.2.0

### Minor Changes

- feat: add monorepo structure with optional store packages for SQLite, MySQL, PostgreSQL, Redis, and MongoDB
