import type { WaDeviceListSnapshot, WaDeviceListStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys } from './helpers'
import type { WaRedisStorageOptions } from './types'

const DEFAULT_DEVICE_LIST_TTL_MS = 5 * 60 * 1000

export class WaDeviceListRedisStore extends BaseRedisStore implements WaDeviceListStore {
    private readonly ttlMs: number

    public constructor(options: WaRedisStorageOptions, ttlMs = DEFAULT_DEVICE_LIST_TTL_MS) {
        super(options)
        if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
            throw new Error('device-list ttlMs must be a positive integer')
        }
        this.ttlMs = ttlMs
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        if (snapshots.length === 0) return
        const pipeline = this.redis.pipeline()
        for (const snapshot of snapshots) {
            const key = this.k('devlist', this.sessionId, snapshot.userJid)
            pipeline.hset(key, {
                device_jids_json: JSON.stringify(snapshot.deviceJids),
                updated_at_ms: String(snapshot.updatedAtMs)
            })
            pipeline.pexpire(key, this.ttlMs)
        }
        await pipeline.exec()
    }

    public async getUserDevicesBatch(
        userJids: readonly string[],
        _nowMs?: number
    ): Promise<readonly (WaDeviceListSnapshot | null)[]> {
        if (userJids.length === 0) return []

        const pipeline = this.redis.pipeline()
        for (const userJid of userJids) {
            pipeline.hgetall(this.k('devlist', this.sessionId, userJid))
        }
        const results = await pipeline.exec()
        if (!results) return userJids.map(() => null)

        return userJids.map((userJid, index) => {
            const [err, data] = results[index]
            if (err || !data || typeof data !== 'object') return null
            const record = data as Record<string, string>
            if (Object.keys(record).length === 0) return null

            const parsed: unknown = JSON.parse(record.device_jids_json)
            if (!Array.isArray(parsed)) {
                throw new Error('device_jids_json must be an array')
            }

            return {
                userJid,
                deviceJids: parsed.map((entry: unknown) => String(entry)),
                updatedAtMs: Number(record.updated_at_ms)
            }
        })
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        const key = this.k('devlist', this.sessionId, userJid)
        return this.redis.del(key)
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        const pattern = this.k('devlist', this.sessionId, '*')
        const keys = await scanKeys(this.redis, pattern)
        if (keys.length > 0) {
            await deleteKeysChunked(this.redis, keys)
        }
    }
}
