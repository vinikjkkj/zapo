import type Redis from 'ioredis'
import type { RedisOptions } from 'ioredis'

export interface WaRedisStorageOptions {
    readonly redis: Redis
    readonly sessionId: string
    readonly keyPrefix?: string
}

export interface WaRedisCreateStoreOptions {
    readonly redis: Redis | RedisOptions
    readonly keyPrefix?: string
}
