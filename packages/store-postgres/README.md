# @zapo-js/store-postgres

PostgreSQL-backed persistent store for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Built on [`pg`](https://node-postgres.com/). Best fit when your stack standardizes on Postgres and you want session state to ride the same backups, replication and IAM as your application data.

Migrations run lazily on first touch per domain. Cache domains require a background poller (`startCleanup`) because Postgres has no native TTL.

## Install

```bash
npm install @zapo-js/store-postgres pg
```

`pg` is a peer dependency.

## Quick start

```ts
import { createStore, WaClient } from 'zapo-js'
import { createPostgresStore } from '@zapo-js/store-postgres'

const result = createPostgresStore({
    pool: { connectionString: process.env.DATABASE_URL },
    tablePrefix: 'wa_'
})

const store = createStore({
    backends: { pg: result },
    providers: {
        auth: 'pg',
        signal: 'pg',
        senderKey: 'pg',
        appState: 'pg',
        privacyToken: 'pg'
    }
})

const client = new WaClient({ store, sessionId: 'default' })

// Start one cleanup poller per session (otherwise expired cache rows grow forever)
const poller = result.startCleanup('default')

// On shutdown
process.on('SIGTERM', async () => {
    poller.stop()
    await client.disconnect()
    await result.destroy()
})
```

## Config

`createPostgresStore(config)` accepts:

| Field                | Description                                                                                                               |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pool`               | Live `pg` `Pool` **or** `PoolConfig` for a new pool. When the store builds the pool, `destroy()` will `end()` it for you. |
| `tablePrefix`        | Prepended to every table name.                                                                                            |
| `cacheTtlMs`         | TTLs for `retry`, `groupMetadata`, `deviceList`, `messageSecret`.                                                         |
| `cleanup.intervalMs` | How often the cleanup poller scans for expired rows.                                                                      |
| `cleanup.onError`    | Callback for transient cleanup errors.                                                                                    |

The result exposes `{ pool, stores, caches, startCleanup, destroy }`. `destroy()` also stops every poller you started.

## Notes

- Cache rows accumulate without `startCleanup` - reads check `expires_at` so stale data won't be served, but disk usage climbs without bound until pruned.
- Uses `BYTEA` for binary columns and `JSONB` for structured state where applicable; uses `ON CONFLICT DO UPDATE` upserts.
- Migrations use advisory locks, safe to run concurrently from multiple processes.

See the main [`zapo-js`](../../README.md) docs for the full store contract.
