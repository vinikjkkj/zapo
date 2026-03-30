import type { WaDeviceListSnapshot, WaDeviceListStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

interface DeviceListDoc {
    _id: { session_id: string; user_jid: string }
    device_jids: string[]
    updated_at_ms: number
    expires_at: Date
}

const DEFAULT_DEVICE_LIST_TTL_MS = 5 * 60 * 1000

export class WaDeviceListMongoStore extends BaseMongoStore implements WaDeviceListStore {
    private readonly ttlMs: number

    public constructor(options: WaMongoStorageOptions, ttlMs = DEFAULT_DEVICE_LIST_TTL_MS) {
        super(options)
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('device-list ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    protected override async createIndexes(): Promise<void> {
        const col = this.col<DeviceListDoc>('device_list_cache')
        await col.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        if (snapshots.length === 0) return
        await this.ensureIndexes()
        const col = this.col<DeviceListDoc>('device_list_cache')
        const ops = snapshots.map((snapshot) => ({
            updateOne: {
                filter: { _id: { session_id: this.sessionId, user_jid: snapshot.userJid } },
                update: {
                    $set: {
                        device_jids: snapshot.deviceJids as string[],
                        updated_at_ms: snapshot.updatedAtMs,
                        expires_at: new Date(snapshot.updatedAtMs + this.ttlMs)
                    }
                },
                upsert: true
            }
        }))
        await col.bulkWrite(ops)
    }

    public async getUserDevicesBatch(
        userJids: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (WaDeviceListSnapshot | null)[]> {
        if (userJids.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<DeviceListDoc>('device_list_cache')
        const uniqueUserJids = [...new Set(userJids)]
        const docs = await col
            .find({
                '_id.session_id': this.sessionId,
                '_id.user_jid': { $in: uniqueUserJids },
                expires_at: { $gt: new Date(nowMs) }
            })
            .toArray()

        const byUserJid = new Map<string, WaDeviceListSnapshot>()
        for (const doc of docs) {
            byUserJid.set(doc._id.user_jid, {
                userJid: doc._id.user_jid,
                deviceJids: doc.device_jids,
                updatedAtMs: doc.updated_at_ms
            })
        }
        return userJids.map((jid) => byUserJid.get(jid) ?? null)
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        await this.ensureIndexes()
        const col = this.col<DeviceListDoc>('device_list_cache')
        const result = await col.deleteOne({
            _id: { session_id: this.sessionId, user_jid: userJid }
        })
        return result.deletedCount
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<DeviceListDoc>('device_list_cache')
        await col.deleteMany({ '_id.session_id': this.sessionId })
    }
}
