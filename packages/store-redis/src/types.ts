import type { default as Redis, RedisOptions } from 'ioredis'
import type { Logger } from 'zapo-js'

export interface WaRedisStorageOptions {
    readonly redis: Redis
    readonly sessionId: string
    readonly keyPrefix?: string
    /**
     * Optional sliding TTL (in ms) applied to every key this store writes,
     * implemented as Redis `PEXPIRE` so the server prunes expired entries -
     * no background cleanup. Leave unset for persistent (non-expiring) keys;
     * when unset every TTL helper is a no-op, so behavior is unchanged.
     *
     * Data stores (messages/threads/contacts/privacyToken) refresh the TTL on
     * write only (retention from last write). Crypto/session stores refresh on
     * read too (idle-session GC), so an actively-used session keeps its keys
     * alive. Wired per-domain by `createRedisStore` via `storeTtlMs`.
     */
    readonly ttlMs?: number
    /**
     * Logger passed through by `createRedisStore`. The factory binds
     * `{ scope: 'store', provider: 'redis' }` for Redis connection lifecycle
     * logs, then adds `{ domain: '<name>', sessionId }` on the child logger
     * passed into each store/cache. Leave unset for silent operation.
     */
    readonly logger?: Logger
}

export interface WaRedisCreateStoreOptions {
    readonly redis: Redis | RedisOptions
    readonly keyPrefix?: string
}
