import type { WaDeviceListSnapshot, WaDeviceListStore } from '@store/contracts/device-list.store'
import { resolvePositive } from '@util/coercion'
import { resolveCleanupIntervalMs, setBoundedMapEntry } from '@util/collections'

interface WaDeviceListMemoryStoreRecord extends WaDeviceListSnapshot {
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 5 * 60 * 1000,
    maxUsers: 16_384
} as const)

export interface WaDeviceListMemoryStoreOptions {
    readonly maxUsers?: number
}

export class WaDeviceListMemoryStore implements WaDeviceListStore {
    private readonly records: Map<string, WaDeviceListMemoryStoreRecord>
    private readonly ttlMs: number
    private readonly maxUsers: number
    private readonly cleanupTimer: NodeJS.Timeout

    public constructor(ttlMs = DEFAULTS.ttlMs, options: WaDeviceListMemoryStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('device-list ttlMs must be a positive finite number')
        }
        this.records = new Map()
        this.ttlMs = ttlMs
        this.maxUsers = resolvePositive(
            options.maxUsers,
            DEFAULTS.maxUsers,
            'WaDeviceListMemoryStoreOptions.maxUsers'
        )
        this.cleanupTimer = setInterval(() => {
            void this.cleanupExpired(Date.now())
        }, resolveCleanupIntervalMs(ttlMs))
        this.cleanupTimer.unref()
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        for (let index = 0; index < snapshots.length; index += 1) {
            const snapshot = snapshots[index]
            setBoundedMapEntry(
                this.records,
                snapshot.userJid,
                {
                    ...snapshot,
                    expiresAtMs: snapshot.updatedAtMs + this.ttlMs
                },
                this.maxUsers
            )
        }
    }

    public async getUserDevicesBatch(
        userJids: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (WaDeviceListSnapshot | null)[]> {
        const snapshots = new Array<WaDeviceListSnapshot | null>(userJids.length)
        for (let index = 0; index < userJids.length; index += 1) {
            const userJid = userJids[index]
            const record = this.records.get(userJid)
            if (!record) {
                snapshots[index] = null
                continue
            }
            if (record.expiresAtMs <= nowMs) {
                this.records.delete(userJid)
                snapshots[index] = null
                continue
            }
            snapshots[index] = record
        }
        return snapshots
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        return this.records.delete(userJid) ? 1 : 0
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        let removed = 0
        for (const [userJid, record] of this.records) {
            if (record.expiresAtMs > nowMs) continue
            this.records.delete(userJid)
            removed += 1
        }
        return removed
    }

    public async clear(): Promise<void> {
        this.records.clear()
    }

    public async destroy(): Promise<void> {
        clearInterval(this.cleanupTimer)
        await this.clear()
    }
}
