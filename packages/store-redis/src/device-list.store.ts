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
        const readPipeline = this.redis.pipeline()
        for (const snapshot of snapshots) {
            readPipeline.hget(this.k('devlist', this.sessionId, snapshot.userJid), 'alt_user_jid')
        }
        const readResults = (await readPipeline.exec()) ?? []
        const previousAltKeys = readResults.map(
            (result): string | null => (result?.[1] as string | null) ?? null
        )
        const pipeline = this.redis.pipeline()
        for (let index = 0; index < snapshots.length; index += 1) {
            const snapshot = snapshots[index]
            const key = this.k('devlist', this.sessionId, snapshot.userJid)
            const previousAlt = previousAltKeys[index]
            if (previousAlt && previousAlt !== snapshot.altUserJid) {
                pipeline.del(this.k('devlistalt', this.sessionId, previousAlt))
            }
            const fields: Record<string, string> = {
                device_jids_json: JSON.stringify(snapshot.deviceJids),
                updated_at_ms: String(snapshot.updatedAtMs)
            }
            if (snapshot.altUserJid !== undefined) {
                fields.alt_user_jid = snapshot.altUserJid
            } else {
                pipeline.hdel(key, 'alt_user_jid')
            }
            pipeline.hset(key, fields)
            pipeline.pexpire(key, this.ttlMs)
            if (snapshot.altUserJid !== undefined) {
                const altKey = this.k('devlistalt', this.sessionId, snapshot.altUserJid)
                pipeline.set(altKey, snapshot.userJid, 'PX', this.ttlMs)
            }
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

        return userJids.map((userJid, index) => decodeSnapshot(userJid, results[index]))
    }

    public async findByAnyUserJid(
        jid: string,
        _nowMs?: number
    ): Promise<WaDeviceListSnapshot | null> {
        const direct = await this.redis.hgetall(this.k('devlist', this.sessionId, jid))
        const directSnapshot = decodeSnapshot(jid, [null, direct])
        if (directSnapshot) return directSnapshot
        const primary = await this.redis.get(this.k('devlistalt', this.sessionId, jid))
        if (!primary) return null
        const data = await this.redis.hgetall(this.k('devlist', this.sessionId, primary))
        return decodeSnapshot(primary, [null, data])
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        const key = this.k('devlist', this.sessionId, userJid)
        const altUserJid = await this.redis.hget(key, 'alt_user_jid')
        const removed = await this.redis.del(key)
        if (altUserJid) {
            await this.redis.del(this.k('devlistalt', this.sessionId, altUserJid))
        }
        return removed
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        const patterns = [
            this.k('devlist', this.sessionId, '*'),
            this.k('devlistalt', this.sessionId, '*')
        ]
        for (const pattern of patterns) {
            const keys = await scanKeys(this.redis, pattern)
            if (keys.length > 0) {
                await deleteKeysChunked(this.redis, keys)
            }
        }
    }
}

function decodeSnapshot(
    userJid: string,
    result: [Error | null, unknown] | undefined
): WaDeviceListSnapshot | null {
    if (!result) return null
    const [err, data] = result
    if (err || !data || typeof data !== 'object') return null
    const record = data as Record<string, string>
    if (Object.keys(record).length === 0) return null
    const parsed: unknown = JSON.parse(record.device_jids_json)
    if (!Array.isArray(parsed)) {
        throw new Error('device_jids_json must be an array')
    }
    const altUserJid = record.alt_user_jid
    return {
        userJid,
        ...(altUserJid ? { altUserJid } : {}),
        deviceJids: parsed.map((entry: unknown) => String(entry)),
        updatedAtMs: Number(record.updated_at_ms)
    }
}
