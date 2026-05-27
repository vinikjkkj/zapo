# @zapo-js/store-sqlite

SQLite-backed persistent store for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Suitable for single-process bots, dev sessions, and small-to-medium production deployments that don't need a network database.

Backed by `better-sqlite3` on Node and `bun:sqlite` on Bun (auto-detected). Lazy migrations run on first touch per domain; all writes go through `withTransaction` so partial failures roll back cleanly.

## Install

```bash
npm install @zapo-js/store-sqlite better-sqlite3
# or on Bun
bun add @zapo-js/store-sqlite
```

`better-sqlite3` is a peer dependency on Node. Bun ships SQLite natively, so it's not required there.

## Quick start

```ts
import { createStore, WaClient } from 'zapo-js'
import { createSqliteStore } from '@zapo-js/store-sqlite'

const store = createStore({
    backends: {
        sqlite: createSqliteStore({ path: '.auth/state.sqlite' })
    },
    providers: {
        auth: 'sqlite',
        signal: 'sqlite',
        senderKey: 'sqlite',
        appState: 'sqlite',
        // optional: archive messages/threads/contacts for later quote/addon decryption
        messages: 'sqlite',
        threads: 'sqlite',
        contacts: 'sqlite',
        privacyToken: 'sqlite'
    }
})

const client = new WaClient({ store, sessionId: 'default' })
```

## Config

`createSqliteStore(config)` accepts:

| Field        | Description                                                                           |
| ------------ | ------------------------------------------------------------------------------------- |
| `path`       | Database file path. Use `':memory:'` for an ephemeral DB.                             |
| `driver`     | `'auto'` (default) / `'better-sqlite3'` / `'bun'`.                                    |
| `pragmas`    | Extra `PRAGMA` statements merged on top of defaults.                                  |
| `tableNames` | Per-domain table name overrides.                                                      |
| `batchSizes` | Per-domain bulk-read batch sizes.                                                     |
| `cacheTtlMs` | TTLs for the cache domains (`retry`, `groupMetadata`, `deviceList`, `messageSecret`). |

The returned object is shaped as a `WaStoreBackend` (`{ stores, caches }`) - feed it to `createStore({ backends: { sqlite: ... } })` and reference it by name in `providers`/`cacheProviders`.

## Notes

- Migrations are idempotent and run lazily. Sharing one DB file across many session ids is supported and recommended (each session is scoped by `session_id`).
- For high write throughput, set `pragmas: { journal_mode: 'WAL', synchronous: 'NORMAL' }`.
- The cache domains (`retry`, `groupMetadata`, `deviceList`, `messageSecret`) expire rows lazily on read; you don't need a background cleanup job.

See the main [`zapo-js`](../../README.md) docs for the full store contract and per-domain semantics.
