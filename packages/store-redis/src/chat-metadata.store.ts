import type { WaChatMetadataSnapshot, WaChatMetadataStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys } from './helpers'
import type { WaRedisStorageOptions } from './types'

const DEFAULT_CHAT_METADATA_TTL_MS = 30 * 60 * 1000

const NUMERIC_FIELDS = Object.freeze({
    ephemeral_expiration: 'ephemeralExpiration',
    ephemeral_setting_timestamp: 'ephemeralSettingTimestamp'
} as const)

export class WaChatMetadataRedisStore extends BaseRedisStore implements WaChatMetadataStore {
    private readonly ttlMs: number

    public constructor(options: WaRedisStorageOptions, ttlMs = DEFAULT_CHAT_METADATA_TTL_MS) {
        super(options)
        if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
            throw new Error('chatMetadata ttlMs must be a positive integer')
        }
        this.ttlMs = ttlMs
    }

    public async upsertChatMetadata(snapshot: WaChatMetadataSnapshot): Promise<void> {
        const key = this.k('chat_metadata', this.sessionId, snapshot.chatJid)
        const pipeline = this.redis.pipeline()
        const fields: Record<string, string> = {
            updated_at_ms: String(snapshot.updatedAtMs)
        }
        for (const [field, prop] of Object.entries(NUMERIC_FIELDS)) {
            const value = snapshot[prop]
            if (value === undefined) {
                pipeline.hdel(key, field)
            } else {
                fields[field] = String(value)
            }
        }
        pipeline.hset(key, fields)
        pipeline.pexpire(key, this.ttlMs)
        await pipeline.exec()
    }

    public async getChatMetadata(
        chatJid: string,
        _nowMs?: number
    ): Promise<WaChatMetadataSnapshot | null> {
        const key = this.k('chat_metadata', this.sessionId, chatJid)
        const data = await this.redis.hgetall(key)
        if (!data || Object.keys(data).length === 0) return null

        const num = (field: string): number | undefined =>
            data[field] === undefined ? undefined : Number(data[field])
        return {
            chatJid,
            ephemeralExpiration: num('ephemeral_expiration'),
            ephemeralSettingTimestamp: num('ephemeral_setting_timestamp'),
            updatedAtMs: Number(data.updated_at_ms)
        }
    }

    public async deleteChatMetadata(chatJid: string): Promise<number> {
        return this.redis.del(this.k('chat_metadata', this.sessionId, chatJid))
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        const keys = await scanKeys(this.redis, this.k('chat_metadata', this.sessionId, '*'))
        if (keys.length > 0) {
            await deleteKeysChunked(this.redis, keys)
        }
    }
}
