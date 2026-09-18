# @zapo-js/store-sqlite

SQLite-backed persistent store for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Suitable for single-process bots, dev sessions, and small-to-medium production deployments that don't need a network database.

Backed by `better-sqlite3` on Node, `bun:sqlite` on Bun, or the runtime's built-in `node:sqlite` when no native addon is available (auto-detected). Lazy migrations run on first touch per domain; all writes go through `withTransaction` so partial failures roll back cleanly.

## Install

```bash
npm install @zapo-js/store-sqlite better-sqlite3
# or on Bun
bun add @zapo-js/store-sqlite
# or with no native dependency at all (Node 22.13+)
npm install @zapo-js/store-sqlite
```

`better-sqlite3` is an optional peer dependency. Skip it and the store falls back to `node:sqlite`, which ships with the runtime, so nothing has to be compiled.

### Choosing a driver

`'auto'` (the default) picks `bun:sqlite` under Bun, otherwise `better-sqlite3`, falling back to `node:sqlite` when the addon is not installed. Pin `driver` explicitly only when you need a specific backend.

| Driver           | Requires                      | Notes                                                                                                                                                  |
| ---------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `better-sqlite3` | native addon (build/prebuild) | Fastest row materialization on Node. Does not load under Bun.                                                                                          |
| `bun`            | Bun                           | `bun:sqlite`, ships with the runtime.                                                                                                                  |
| `node`           | Node 22.13+ or Bun 1.4+       | `node:sqlite`, ships with the runtime. Node 22.5 to 22.12 keeps it behind `--experimental-sqlite`; Node warns while the module is marked experimental. |

On Node 20, 21, or 22.5 to 22.12 without the flag, `node:sqlite` does not exist, so `'auto'` cannot fall back to it - you get the `better-sqlite3` install error, which is the only real fix there. Installing the addon keeps working on every version: `'auto'` prefers it and never touches `node:sqlite`.

The database file is identical across drivers - the same schema and migrations - so you can switch drivers on an existing store without migrating anything.

Write throughput is effectively the same on all three (SQLite itself dominates). `node:sqlite` is slower only when materializing wide or multi-row result sets, since it builds a fresh object per row: roughly 1.3x on a single wide row and 2.5x on a 50-row page with blobs, measured against `better-sqlite3` on Node 22. That cost lands on history/mailbox queries, not on the per-message session writes.

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

| Field        | Description                                                                                                                                 |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `path`       | Database file path. Use `':memory:'` for an ephemeral DB. Mutually exclusive with `connection`.                                             |
| `connection` | Pre-opened `WaSqliteConnection` to reuse instead of opening a new one. Caller owns the lifecycle (per-store `destroy()` does not close it). |
| `driver`     | `'auto'` (default) / `'better-sqlite3'` / `'bun'` / `'node'`. Ignored when `connection` is set.                                             |
| `pragmas`    | Extra `PRAGMA` statements merged on top of defaults. Ignored when `connection` is set.                                                      |
| `tableNames` | Per-domain table name overrides. Ignored when `connection` is set.                                                                          |
| `batchSizes` | Per-domain bulk-read batch sizes.                                                                                                           |
| `cacheTtlMs` | TTLs for the cache domains (`retry`, `groupMetadata`, `deviceList`, `messageSecret`).                                                       |

The returned object is shaped as a `WaStoreBackend` (`{ stores, caches }`) - feed it to `createStore({ backends: { sqlite: ... } })` and reference it by name in `providers`/`cacheProviders`.

### Bring your own connection

To share a single SQLite connection with the rest of your application, open it yourself with `openSqliteConnection` and pass it through `connection`:

```ts
import { createSqliteStore, openSqliteConnection } from '@zapo-js/store-sqlite'

const connection = await openSqliteConnection({
    path: 'app.sqlite',
    sessionId: 'shared',
    pragmas: { journal_mode: 'WAL', synchronous: 'NORMAL' }
})

const store = createStore({
    backends: { sqlite: createSqliteStore({ connection }) },
    providers: { auth: 'sqlite', signal: 'sqlite', senderKey: 'sqlite', appState: 'sqlite' }
})

// ... use connection elsewhere in your app ...

await store.destroy()
connection.close() // you opened it, you close it
```

## Notes

- Migrations are idempotent and run lazily. Sharing one DB file across many session ids is supported and recommended (each session is scoped by `session_id`).
- For high write throughput, set `pragmas: { journal_mode: 'WAL', synchronous: 'NORMAL' }`.
- The cache domains (`retry`, `groupMetadata`, `deviceList`, `messageSecret`) expire rows lazily on read; you don't need a background cleanup job.

See the main [`zapo-js`](../../README.md) docs for the full store contract and per-domain semantics.
