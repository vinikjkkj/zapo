import type { Logger } from '@infra/log/types'
import type {
    WaGroupMetadataSnapshot,
    WaGroupMetadataStore
} from '@store/contracts/group-metadata.store'
import { resolvePositive } from '@util/coercion'
import {
    createPeriodicCleanup,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

interface WaGroupMetadataMemoryStoreRecord extends WaGroupMetadataSnapshot {
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 5 * 60 * 1000,
    maxGroups: 4_096
} as const)

export interface WaGroupMetadataMemoryStoreOptions {
    readonly maxGroups?: number
    /**
     * Logger for capacity-saturation warnings. Emits a single `warn` the
     * first time the bounded map evicts an entry; subsequent evictions are
     * silent to avoid spam.
     */
    readonly logger?: Logger
}

export class WaGroupMetadataMemoryStore implements WaGroupMetadataStore {
    private readonly records: Map<string, WaGroupMetadataMemoryStoreRecord>
    private readonly ttlMs: number
    private readonly maxGroups: number
    private readonly cleanup: PeriodicCleanupHandle
    private readonly logger: Logger | undefined
    private capacityWarned: boolean

    public constructor(ttlMs = DEFAULTS.ttlMs, options: WaGroupMetadataMemoryStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('groupMetadata ttlMs must be a positive finite number')
        }
        this.records = new Map()
        this.ttlMs = ttlMs
        this.maxGroups = resolvePositive(
            options.maxGroups,
            DEFAULTS.maxGroups,
            'WaGroupMetadataMemoryStoreOptions.maxGroups'
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
        this.logger.warn('group metadata store at capacity, evicting oldest', {
            max: this.maxGroups
        })
    }

    public async upsertGroupMetadata(snapshot: WaGroupMetadataSnapshot): Promise<void> {
        setBoundedMapEntry(
            this.records,
            snapshot.groupJid,
            {
                ...snapshot,
                expiresAtMs: snapshot.updatedAtMs + this.ttlMs
            },
            this.maxGroups,
            () => this.warnCapacity()
        )
    }

    public async getGroupMetadata(
        groupJid: string,
        nowMs = Date.now()
    ): Promise<WaGroupMetadataSnapshot | null> {
        const record = this.records.get(groupJid)
        if (!record) {
            return null
        }
        if (record.expiresAtMs <= nowMs) {
            this.records.delete(groupJid)
            return null
        }
        return record
    }

    public async deleteGroupMetadata(groupJid: string): Promise<number> {
        return this.records.delete(groupJid) ? 1 : 0
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        let removed = 0
        for (const [groupJid, record] of this.records) {
            if (record.expiresAtMs > nowMs) continue
            this.records.delete(groupJid)
            removed += 1
        }
        return removed
    }

    public async clear(): Promise<void> {
        this.records.clear()
    }

    public async destroy(): Promise<void> {
        this.cleanup.destroy()
        await this.clear()
    }
}
