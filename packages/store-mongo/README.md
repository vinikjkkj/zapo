# @zapo-js/store-mongo

MongoDB-backed persistent store for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Good fit for fleets that already operate on MongoDB and want session state to ride that same infrastructure (replica sets, Atlas, etc.).

Cache domains are backed by MongoDB TTL indexes - expired documents are pruned by the server's TTL monitor (~60s sweep), so no background cleanup job is required from your side.

## Install

```bash
npm install @zapo-js/store-mongo mongodb
```

`mongodb` is a peer dependency.

## Quick start

```ts
import { createStore, WaClient } from 'zapo-js'
import { createMongoStore } from '@zapo-js/store-mongo'

const store = createStore({
    backends: {
        mongo: createMongoStore({
            db: { uri: 'mongodb://localhost:27017', database: 'wa' },
            collectionPrefix: 'wa_'
        })
    },
    providers: {
        auth: 'mongo',
        signal: 'mongo',
        senderKey: 'mongo',
        appState: 'mongo',
        privacyToken: 'mongo'
    }
})

const client = new WaClient({ store, sessionId: 'default' })
```

## Config

`createMongoStore(config)` accepts:

| Field              | Description                                                                                                                                               |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db`               | Existing `Db` **or** `{ uri, database, options? }` to build a new client. When the store builds the client itself, `destroy()` will `close()` it for you. |
| `collectionPrefix` | Prepended to every collection name.                                                                                                                       |
| `cacheTtlMs`       | TTLs for `retry`, `groupMetadata`, `deviceList`, `messageSecret` (TTL indexes).                                                                           |

The result exposes `{ db, stores, caches, destroy }` so you can reuse the database handle and shut the client down cleanly on exit.

## Notes

- Pass an externally-owned `Db` when you want full control over the connection (replica sets, Atlas pooling, transactions across apps).
- The TTL-monitor latency means cache entries can outlive the TTL by up to ~1 minute. Acceptable for `groupMetadata`/`deviceList`; for tighter eviction prefer `@zapo-js/store-redis`.
- Indexes are created lazily on first touch per collection (one-time cost). Subsequent process restarts skip the create step.

See the main [`zapo-js`](../../README.md) docs for the full store contract.
