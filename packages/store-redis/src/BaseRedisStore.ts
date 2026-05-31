import type Redis from 'ioredis'
import type { Logger } from 'zapo-js'

import { assertSafeKeyPrefix } from './helpers'
import type { WaRedisStorageOptions } from './types'

const DEFAULT_SLOW_OPERATION_THRESHOLD_MS = 250

export abstract class BaseRedisStore {
    protected readonly redis: Redis
    protected readonly sessionId: string
    protected readonly keyPrefix: string
    protected readonly logger: Logger | undefined
    protected readonly slowOperationThresholdMs: number

    protected constructor(options: WaRedisStorageOptions) {
        this.redis = options.redis
        this.sessionId = options.sessionId
        this.keyPrefix = options.keyPrefix ?? ''
        this.logger = options.logger
        this.slowOperationThresholdMs =
            options.slowOperationThresholdMs ?? DEFAULT_SLOW_OPERATION_THRESHOLD_MS
        assertSafeKeyPrefix(this.keyPrefix)
    }

    protected k(...parts: readonly string[]): string {
        return `${this.keyPrefix}${parts.join(':')}`
    }

    /**
     * Wraps an operation in slow-command timing. Emits a `warn` when the
     * call exceeds `slowOperationThresholdMs`. No-op when no logger is set.
     */
    protected async timed<T>(operation: string, run: () => Promise<T> | T): Promise<T> {
        if (!this.logger) {
            return run()
        }
        const startedAt = Date.now()
        try {
            return await run()
        } finally {
            const durationMs = Date.now() - startedAt
            if (durationMs >= this.slowOperationThresholdMs) {
                this.logger.warn('slow redis operation', {
                    operation,
                    durationMs,
                    thresholdMs: this.slowOperationThresholdMs
                })
            }
        }
    }

    public async destroy(): Promise<void> {
        // Redis connection is shared, don't close
    }
}
