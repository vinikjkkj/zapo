import type { WaDeviceListSnapshot, WaDeviceListStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import type { WaMongoStorageOptions } from './types'

interface DeviceListDoc {
    _id: { session_id: string; user_jid: string }
    alt_user_jid?: string
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
        await col.createIndex(
            { '_id.session_id': 1, alt_user_jid: 1 },
            { name: 'alt_user_jid_lookup', sparse: true }
        )
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        if (snapshots.length === 0) return
        await this.ensureIndexes()
        const col = this.col<DeviceListDoc>('device_list_cache')
        const ops = snapshots.map((snapshot) => {
            const set: Record<string, unknown> = {
                device_jids: snapshot.deviceJids,
                updated_at_ms: snapshot.updatedAtMs,
                expires_at: new Date(snapshot.updatedAtMs + this.ttlMs)
            }
            const update: Record<string, unknown> = { $set: set }
            if (snapshot.altUserJid !== undefined) {
                set.alt_user_jid = snapshot.altUserJid
            } else {
                update.$unset = { alt_user_jid: '' }
            }
            return {
                updateOne: {
                    filter: { _id: { session_id: this.sessionId, user_jid: snapshot.userJid } },
                    update,
                    upsert: true
                }
            }
        })
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
            byUserJid.set(doc._id.user_jid, docToSnapshot(doc))
        }
        return userJids.map((jid) => byUserJid.get(jid) ?? null)
    }

    public async findByAnyUserJid(
        jid: string,
        nowMs = Date.now()
    ): Promise<WaDeviceListSnapshot | null> {
        await this.ensureIndexes()
        const col = this.col<DeviceListDoc>('device_list_cache')
        const doc = await col.findOne({
            '_id.session_id': this.sessionId,
            $or: [{ '_id.user_jid': jid }, { alt_user_jid: jid }],
            expires_at: { $gt: new Date(nowMs) }
        })
        if (!doc) return null
        return docToSnapshot(doc)
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

function docToSnapshot(doc: DeviceListDoc): WaDeviceListSnapshot {
    return {
        userJid: doc._id.user_jid,
        ...(doc.alt_user_jid !== undefined ? { altUserJid: doc.alt_user_jid } : {}),
        deviceJids: doc.device_jids,
        updatedAtMs: doc.updated_at_ms
    }
}
