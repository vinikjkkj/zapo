import type { WaParticipantsSnapshot, WaParticipantsStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys } from './helpers'
import type { WaRedisStorageOptions } from './types'

const DEFAULT_PARTICIPANTS_TTL_MS = 5 * 60 * 1000

export class WaParticipantsRedisStore extends BaseRedisStore implements WaParticipantsStore {
    private readonly ttlMs: number

    public constructor(options: WaRedisStorageOptions, ttlMs = DEFAULT_PARTICIPANTS_TTL_MS) {
        super(options)
        if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
            throw new Error('participants ttlMs must be a positive integer')
        }
        this.ttlMs = ttlMs
    }

    public async upsertGroupParticipants(snapshot: WaParticipantsSnapshot): Promise<void> {
        const key = this.k('participants', this.sessionId, snapshot.groupJid)
        const pipeline = this.redis.pipeline()
        pipeline.hset(key, {
            participants_json: JSON.stringify(snapshot.participants),
            updated_at_ms: String(snapshot.updatedAtMs)
        })
        pipeline.pexpire(key, this.ttlMs)
        await pipeline.exec()
    }

    public async getGroupParticipants(
        groupJid: string,
        _nowMs?: number
    ): Promise<WaParticipantsSnapshot | null> {
        const key = this.k('participants', this.sessionId, groupJid)
        const data = await this.redis.hgetall(key)
        if (!data || Object.keys(data).length === 0) return null

        const parsed: unknown = JSON.parse(data.participants_json)
        if (!Array.isArray(parsed)) {
            throw new Error('participants_json must be an array')
        }

        return {
            groupJid,
            participants: parsed.map((entry: unknown) => String(entry)),
            updatedAtMs: Number(data.updated_at_ms)
        }
    }

    public async deleteGroupParticipants(groupJid: string): Promise<number> {
        const key = this.k('participants', this.sessionId, groupJid)
        return this.redis.del(key)
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        const pattern = this.k('participants', this.sessionId, '*')
        const keys = await scanKeys(this.redis, pattern)
        if (keys.length > 0) {
            await deleteKeysChunked(this.redis, keys)
        }
    }
}
