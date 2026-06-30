import type { ChainableCommander, default as Redis } from 'ioredis'
import type { Logger } from 'zapo-js'

import { assertSafeKeyPrefix } from './helpers'
import type { WaRedisStorageOptions } from './types'

export abstract class BaseRedisStore {
    protected readonly redis: Redis
    protected readonly sessionId: string
    protected readonly keyPrefix: string
    /**
     * Sliding TTL (ms) applied to keys this store writes/reads via {@link touch}
     * and {@link refreshTtl}. Distinct from the cache stores' own `ttlMs`, which
     * predates this and is managed independently in those subclasses.
     */
    protected readonly keyTtlMs: number | undefined
    protected readonly logger: Logger | undefined

    protected constructor(options: WaRedisStorageOptions) {
        this.redis = options.redis
        this.sessionId = options.sessionId
        this.keyPrefix = options.keyPrefix ?? ''
        this.keyTtlMs = options.ttlMs
        this.logger = options.logger
        assertSafeKeyPrefix(this.keyPrefix)
        if (
            this.keyTtlMs !== undefined &&
            (!Number.isSafeInteger(this.keyTtlMs) || this.keyTtlMs <= 0)
        ) {
            throw new Error('store ttlMs must be a positive integer')
        }
    }

    protected k(...parts: readonly string[]): string {
        return `${this.keyPrefix}${parts.join(':')}`
    }

    /**
     * Appends a `PEXPIRE` for each key onto an existing pipeline/multi when a
     * sliding TTL is configured, refreshing the keys atomically with the write
     * they accompany. No-op (zero extra commands) when `ttlMs` is unset, so the
     * default persistent behavior is byte-identical.
     */
    protected touch(pipeline: ChainableCommander, keys: readonly string[]): void {
        if (this.keyTtlMs === undefined) return
        for (const key of keys) {
            pipeline.pexpire(key, this.keyTtlMs)
        }
    }

    /**
     * Atomic single-key `SET` that also stamps the sliding TTL in the same
     * command (`SET ... PX`), so a write never leaves a key without its expiry
     * even if the connection drops mid-sequence. Falls back to a plain `SET`
     * when `ttlMs` is unset.
     */
    protected async setWithTtl(key: string, value: Buffer | string): Promise<void> {
        if (this.keyTtlMs === undefined) {
            await this.redis.set(key, value)
        } else {
            await this.redis.set(key, value, 'PX', this.keyTtlMs)
        }
    }

    /**
     * Batch equivalent of {@link setWithTtl}: a single `MSET` when no TTL is
     * configured, otherwise a pipeline of per-key `SET ... PX` so every key is
     * born with its expiry rather than stamped by a follow-up `PEXPIRE` that a
     * dropped connection could skip.
     */
    protected async msetWithTtl(pairs: ReadonlyArray<readonly [string, Buffer]>): Promise<void> {
        if (pairs.length === 0) return
        if (this.keyTtlMs === undefined) {
            const args: (string | Buffer)[] = []
            for (const [key, value] of pairs) {
                args.push(key, value)
            }
            await (
                this.redis as unknown as { mset: (...args: unknown[]) => Promise<unknown> }
            ).mset(...args)
            return
        }
        const pipeline = this.redis.pipeline()
        for (const [key, value] of pairs) {
            pipeline.set(key, value, 'PX', this.keyTtlMs)
        }
        await pipeline.exec()
    }

    /**
     * Refreshes the sliding TTL on keys outside a write pipeline - used by
     * single-command writes and by read paths (touch-on-access) so an actively
     * used session keeps its keys alive. No-op (no round-trip) when `ttlMs` is
     * unset. `PEXPIRE` on a missing key is itself a harmless no-op, so callers
     * need not pre-check existence.
     */
    protected async refreshTtl(keys: readonly string[]): Promise<void> {
        if (this.keyTtlMs === undefined || keys.length === 0) return
        if (keys.length === 1) {
            await this.redis.pexpire(keys[0], this.keyTtlMs)
            return
        }
        const pipeline = this.redis.pipeline()
        for (const key of keys) {
            pipeline.pexpire(key, this.keyTtlMs)
        }
        await pipeline.exec()
    }

    public async destroy(): Promise<void> {
        // Redis connection is shared, don't close
    }
}
