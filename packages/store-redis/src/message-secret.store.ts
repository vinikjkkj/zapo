import type { WaMessageSecretStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { scanKeys, toBytesOrNull, toRedisBuffer } from './helpers'
import type { WaRedisStorageOptions } from './types'

const DEFAULT_MESSAGE_SECRET_TTL_MS = 30 * 60 * 1000

export class WaMessageSecretRedisStore extends BaseRedisStore implements WaMessageSecretStore {
    private readonly ttlMs: number

    public constructor(options: WaRedisStorageOptions, ttlMs = DEFAULT_MESSAGE_SECRET_TTL_MS) {
        super(options)
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            throw new Error('message-secret ttlMs must be a non-negative finite number')
        }
        this.ttlMs = ttlMs
    }

    public async get(messageId: string, _nowMs?: number): Promise<Uint8Array | null> {
        const key = this.k('msgsecret', this.sessionId, messageId)
        const value = await this.redis.getBuffer(key)
        return toBytesOrNull(value)
    }

    public async getBatch(
        messageIds: readonly string[],
        _nowMs?: number
    ): Promise<readonly (Uint8Array | null)[]> {
        if (messageIds.length === 0) return []

        const pipeline = this.redis.pipeline()
        for (const messageId of messageIds) {
            pipeline.getBuffer(this.k('msgsecret', this.sessionId, messageId))
        }
        const results = await pipeline.exec()
        if (!results) return messageIds.map(() => null)

        return messageIds.map((_messageId, index) => {
            const [err, data] = results[index]
            if (err || data === null || data === undefined) return null
            return toBytesOrNull(data)
        })
    }

    public async set(messageId: string, secret: Uint8Array): Promise<void> {
        const key = this.k('msgsecret', this.sessionId, messageId)
        await this.redis.set(key, toRedisBuffer(secret), 'PX', this.ttlMs)
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly secret: Uint8Array }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const pipeline = this.redis.pipeline()
        for (const entry of entries) {
            const key = this.k('msgsecret', this.sessionId, entry.messageId)
            pipeline.set(key, toRedisBuffer(entry.secret), 'PX', this.ttlMs)
        }
        await pipeline.exec()
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        const pattern = this.k('msgsecret', this.sessionId, '*')
        const keys = await scanKeys(this.redis, pattern)
        if (keys.length > 0) {
            await this.redis.del(...keys)
        }
    }
}
