import type { default as Redis, RedisOptions } from 'ioredis'
import type { Logger } from 'zapo-js'

export interface WaRedisStorageOptions {
    readonly redis: Redis
    readonly sessionId: string
    readonly keyPrefix?: string
    /**
     * Logger used for connection lifecycle events emitted by the
     * factory. Bound automatically by `createRedisStore` with
     * `{ scope: 'store', provider: 'redis', domain: '<name>', sessionId }`.
     * Leave unset for silent operation.
     */
    readonly logger?: Logger
}

export interface WaRedisCreateStoreOptions {
    readonly redis: Redis | RedisOptions
    readonly keyPrefix?: string
}
