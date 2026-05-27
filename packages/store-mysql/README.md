# @zapo-js/store-mysql

MySQL / MariaDB-backed persistent store for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Built on [`mysql2/promise`](https://github.com/sidorares/node-mysql2). Suitable when your stack standardizes on MySQL/MariaDB and you want session state to ride the same backup, replication and IAM as the rest of your data.

Migrations run lazily on first touch per domain. Cache domains need a background poller (`startCleanup`) because MySQL has no native TTL.

## Install

```bash
npm install @zapo-js/store-mysql mysql2
```

`mysql2` is a peer dependency.

## Quick start

```ts
import { createStore, WaClient } from 'zapo-js'
import { createMysqlStore } from '@zapo-js/store-mysql'

const result = createMysqlStore({
    pool: {
        host: 'localhost',
        user: 'wa',
        password: 'wa',
        database: 'wa'
    },
    tablePrefix: 'wa_'
})

const store = createStore({
    backends: { mysql: result },
    providers: {
        auth: 'mysql',
        signal: 'mysql',
        senderKey: 'mysql',
        appState: 'mysql',
        privacyToken: 'mysql'
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

`createMysqlStore(config)` accepts:

| Field                | Description                                                                                                                            |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `pool`               | Live `mysql2/promise` `Pool` **or** `PoolOptions` for a new pool. When the store builds the pool, `destroy()` will `end()` it for you. |
| `tablePrefix`        | Prepended to every table name.                                                                                                         |
| `cacheTtlMs`         | TTLs for `retry`, `groupMetadata`, `deviceList`, `messageSecret`.                                                                      |
| `cleanup.intervalMs` | How often the cleanup poller scans for expired rows.                                                                                   |
| `cleanup.onError`    | Callback for transient cleanup errors (network, deadlock, ...).                                                                        |

The result exposes `{ pool, stores, caches, startCleanup, destroy }`. Call `startCleanup(sessionId)` once per session - the poller's `stop()` is also called automatically by `destroy()`.

## Notes

- Cache rows accumulate without `startCleanup` - even though reads check `expires_at`, the row stays in the table until the next write to the same key.
- The schema uses `utf8mb4` and `BLOB` columns; row sizes are small except for `messages.body_proto` (variable-size protobuf).
- Migrations are idempotent and serialized via `INFORMATION_SCHEMA` lookups, safe to run concurrently from multiple processes.

See the main [`zapo-js`](../../README.md) docs for the full store contract.
