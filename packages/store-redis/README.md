# @zapo-js/store-redis

Redis-backed persistent store for [`zapo-js`](https://www.npmjs.com/package/zapo-js). Best fit when you already run Redis for caching and want stateless app instances that can share WhatsApp session state through a network database.

Built on [`ioredis`](https://github.com/redis/ioredis). All 12 persistent domains and 4 cache domains live under a single key namespace (`keyPrefix` controls it). Cache TTLs are enforced natively by Redis - no background cleanup job needed.

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
| `storeTtlMs` | Opt-in TTLs for the otherwise-persistent store domains (see [Store TTLs](#store-ttls)). Any domain left unset stays persistent.                  |

The return value extends `WaStoreBackend` with `{ redis, destroy }` so you can reuse the same connection elsewhere and shut it down cleanly on app exit.

## Store TTLs

The persistent domains never expire by default. `storeTtlMs` lets you put an
optional Redis-native TTL on individual domains (applied as `PEXPIRE` on each
write - no cleanup job), with two semantics depending on the domain kind:

```ts
createRedisStore({
    redis: { host: '127.0.0.1', port: 6379 },
    storeTtlMs: {
        // Data domains - expire N ms after the last write (history/retention):
        messagesMs: 30 * 24 * 60 * 60 * 1000,
        threadsMs: 30 * 24 * 60 * 60 * 1000,
        contactsMs: 30 * 24 * 60 * 60 * 1000,
        privacyTokenMs: 7 * 24 * 60 * 60 * 1000,
        // Crypto & session domains - sliding TTL, refreshed on read too, so
        // only idle sessions are evicted (active ones never expire):
        signalMs: 90 * 24 * 60 * 60 * 1000,
        preKeyMs: 90 * 24 * 60 * 60 * 1000,
        sessionMs: 90 * 24 * 60 * 60 * 1000,
        identityMs: 90 * 24 * 60 * 60 * 1000,
        senderKeyMs: 90 * 24 * 60 * 60 * 1000,
        appStateMs: 90 * 24 * 60 * 60 * 1000
    }
})
```

- **Data** (`messagesMs`, `threadsMs`, `contactsMs`, `privacyTokenMs`): TTL is
  refreshed on write only - keys expire a fixed window after their last update.
- **Crypto & session** (`signalMs`, `preKeyMs`, `sessionMs`, `identityMs`,
  `senderKeyMs`, `appStateMs`): TTL is refreshed on read **and** write, so an
  actively used session keeps its keys alive and only genuinely idle sessions
  are reclaimed.
- **`auth` has no TTL knob** on purpose: expiring login credentials would log
  the device out. It always persists.
- **`lidPnMapping` also has no TTL knob**: expiring the address index while a
  Signal session remains usable could make the same device resolve to a second
  ratchet. The client removes it when session state is cleared.

> Set a crypto/session TTL short relative to how often a session connects at
> your own risk - an idle window longer than the TTL evicts the Signal / app-state
> keys and forces a re-handshake or re-sync on next use.

## Notes

- Pass an externally-owned `Redis` when you want to control its lifecycle yourself (clusters, sentinel, etc.) - the library will not call `quit()` on it.
- Keys are JSON-encoded blobs. Migrating to a different backend later means draining via the in-memory store or doing a one-shot SCAN copy.
- For multi-region deployments, use the same `keyPrefix` across instances and let Redis replication handle session sharing.

See the main [`zapo-js`](../../README.md) docs for the full store contract.
