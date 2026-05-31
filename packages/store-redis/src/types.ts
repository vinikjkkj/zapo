import type { default as Redis, RedisOptions } from 'ioredis'
import type { Logger } from 'zapo-js'

export interface WaRedisStorageOptions {
    readonly redis: Redis
    readonly sessionId: string
    readonly keyPrefix?: string
    /**
     * Logger used for slow-command warnings and connection events. Bound
     * automatically by `createRedisStore` with `{ scope: 'store',
     * provider: 'redis', domain: '<name>', sessionId }`. Leave unset for
     * silent operation.
     */
    readonly logger?: Logger
    /**
     * Threshold in milliseconds above which a Redis command emits a
     * `warn`. Defaults to `250`.
     */
    readonly slowOperationThresholdMs?: number
}

export interface WaRedisCreateStoreOptions {
    readonly redis: Redis | RedisOptions
    readonly keyPrefix?: string
}
