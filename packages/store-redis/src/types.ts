import type { default as Redis, RedisOptions } from 'ioredis'
import type { Logger } from 'zapo-js'

export interface WaRedisStorageOptions {
    readonly redis: Redis
    readonly sessionId: string
    readonly keyPrefix?: string
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
