import type { Logger } from '@infra/log/types'
import type { WaDeviceListSnapshot, WaDeviceListStore } from '@store/contracts/device-list.store'
import { resolvePositive } from '@util/coercion'
import {
    createPeriodicCleanup,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

interface WaDeviceListMemoryStoreRecord extends WaDeviceListSnapshot {
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 5 * 60 * 1000,
    maxUsers: 16_384
} as const)

export interface WaDeviceListMemoryStoreOptions {
    readonly maxUsers?: number
    /**
     * Logger for capacity-saturation warnings. Emits a single `warn` the
     * first time the bounded map evicts an entry; subsequent evictions are
     * silent to avoid spam.
     */
    readonly logger?: Logger
}

export class WaDeviceListMemoryStore implements WaDeviceListStore {
    private readonly records: Map<string, WaDeviceListMemoryStoreRecord>
    private readonly altIndex: Map<string, string>
    private readonly ttlMs: number
    private readonly maxUsers: number
    private readonly cleanup: PeriodicCleanupHandle
    private readonly logger: Logger | undefined
    private capacityWarned: boolean

    public constructor(ttlMs = DEFAULTS.ttlMs, options: WaDeviceListMemoryStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('device-list ttlMs must be a positive finite number')
        }
        this.records = new Map()
        this.altIndex = new Map()
        this.ttlMs = ttlMs
        this.maxUsers = resolvePositive(
            options.maxUsers,
            DEFAULTS.maxUsers,
            'WaDeviceListMemoryStoreOptions.maxUsers'
        )
        this.logger = options.logger
        this.capacityWarned = false
        this.cleanup = createPeriodicCleanup(ttlMs, () => {
            void this.cleanupExpired(Date.now())
        })
    }

    private warnCapacity(): void {
        if (this.capacityWarned || !this.logger) return
        this.capacityWarned = true
        this.logger.warn('device list store at capacity, evicting oldest', {
            max: this.maxUsers
        })
    }

    public async upsertUserDevicesBatch(snapshots: readonly WaDeviceListSnapshot[]): Promise<void> {
        for (let index = 0; index < snapshots.length; index += 1) {
            const snapshot = snapshots[index]
            const previous = this.records.get(snapshot.userJid)
            if (previous?.altUserJid && previous.altUserJid !== snapshot.altUserJid) {
                this.altIndex.delete(previous.altUserJid)
            }
            setBoundedMapEntry(
                this.records,
                snapshot.userJid,
                {
                    ...snapshot,
                    expiresAtMs: snapshot.updatedAtMs + this.ttlMs
                },
                this.maxUsers,
                () => this.warnCapacity()
            )
            if (snapshot.altUserJid) {
                this.altIndex.set(snapshot.altUserJid, snapshot.userJid)
            }
        }
    }

    public async getUserDevicesBatch(
        userJids: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (WaDeviceListSnapshot | null)[]> {
        const snapshots = new Array<WaDeviceListSnapshot | null>(userJids.length)
        for (let index = 0; index < userJids.length; index += 1) {
            snapshots[index] = this.readLive(userJids[index], nowMs)
        }
        return snapshots
    }

    public async findByAnyUserJid(
        jid: string,
        nowMs = Date.now()
    ): Promise<WaDeviceListSnapshot | null> {
        const direct = this.readLive(jid, nowMs)
        if (direct) return direct
        const primary = this.altIndex.get(jid)
        if (!primary) return null
        return this.readLive(primary, nowMs)
    }

    public async deleteUserDevices(userJid: string): Promise<number> {
        const record = this.records.get(userJid)
        if (!record) return 0
        if (record.altUserJid) this.altIndex.delete(record.altUserJid)
        this.records.delete(userJid)
        return 1
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        let removed = 0
        for (const [userJid, record] of this.records) {
            if (record.expiresAtMs > nowMs) continue
            if (record.altUserJid) this.altIndex.delete(record.altUserJid)
            this.records.delete(userJid)
            removed += 1
        }
        return removed
    }

    public async clear(): Promise<void> {
        this.records.clear()
        this.altIndex.clear()
    }

    public async destroy(): Promise<void> {
        this.cleanup.destroy()
        await this.clear()
    }

    private readLive(userJid: string, nowMs: number): WaDeviceListSnapshot | null {
        const record = this.records.get(userJid)
        if (!record) return null
        if (record.expiresAtMs <= nowMs) {
            if (record.altUserJid) this.altIndex.delete(record.altUserJid)
            this.records.delete(userJid)
            return null
        }
        return record
    }
}
