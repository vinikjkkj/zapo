import type Redis from 'ioredis'

import { assertSafeKeyPrefix } from './helpers'
import type { WaRedisStorageOptions } from './types'

export abstract class BaseRedisStore {
    protected readonly redis: Redis
    protected readonly sessionId: string
    protected readonly keyPrefix: string

    protected constructor(options: WaRedisStorageOptions) {
        this.redis = options.redis
        this.sessionId = options.sessionId
        this.keyPrefix = options.keyPrefix ?? ''
        assertSafeKeyPrefix(this.keyPrefix)
    }

    protected k(...parts: readonly string[]): string {
        return `${this.keyPrefix}${parts.join(':')}`
    }

    public async destroy(): Promise<void> {
        // Redis connection is shared, don't close
    }
}
