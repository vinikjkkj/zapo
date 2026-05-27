# @zapo-js/store-redis

Redis-backed persistent store for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Best fit when you already run Redis for caching and want stateless app instances that can share WhatsApp session state through a network database.

Built on [`ioredis`](https://github.com/redis/ioredis). All 11 persistent domains and 4 cache domains live under a single key namespace (`keyPrefix` controls it). Cache TTLs are enforced natively by Redis - no background cleanup job needed.

## Install

```bash
npm install @zapo-js/store-redis ioredis
```

`ioredis` is a peer dependency.

## Quick start

```ts
import { createStore, WaClient } from 'zapo-js'
import { createRedisStore } from '@zapo-js/store-redis'

const store = createStore({
    backends: {
        redis: createRedisStore({
            redis: { host: '127.0.0.1', port: 6379 },
            keyPrefix: 'wa:'
        })
    },
    providers: {
        auth: 'redis',
        signal: 'redis',
        senderKey: 'redis',
        appState: 'redis',
        privacyToken: 'redis'
    }
})

const client = new WaClient({ store, sessionId: 'default' })
```

## Config

`createRedisStore(config)` accepts:

| Field        | Description                                                                                                                                      |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `redis`      | A live `ioredis` instance **or** `RedisOptions` for a new client. When the store builds the client itself, `destroy()` will `quit()` it for you. |
| `keyPrefix`  | String prepended to every key (e.g. `'wa:'`, `'tenant-A:'`).                                                                                     |
| `cacheTtlMs` | TTLs for `retry`, `groupMetadata`, `deviceList`, `messageSecret` (Redis `EX`/`PEXPIRE`).                                                         |

The return value extends `WaStoreBackend` with `{ redis, destroy }` so you can reuse the same connection elsewhere and shut it down cleanly on app exit.

## Notes

- Pass an externally-owned `Redis` when you want to control its lifecycle yourself (clusters, sentinel, etc.) - the library will not call `quit()` on it.
- Keys are JSON-encoded blobs. Migrating to a different backend later means draining via the in-memory store or doing a one-shot SCAN copy.
- For multi-region deployments, use the same `keyPrefix` across instances and let Redis replication handle session sharing.

See the main [`zapo-js`](../../README.md) docs for the full store contract.
