import type {
    WaParticipantsSnapshot,
    WaParticipantsStore
} from '@store/contracts/participants.store'
import { resolvePositive } from '@util/coercion'
import { resolveCleanupIntervalMs, setBoundedMapEntry } from '@util/collections'

interface WaParticipantsMemoryStoreRecord extends WaParticipantsSnapshot {
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 5 * 60 * 1000,
    maxGroups: 4_096
} as const)

export interface WaParticipantsMemoryStoreOptions {
    readonly maxGroups?: number
}

export class WaParticipantsMemoryStore implements WaParticipantsStore {
    private readonly records: Map<string, WaParticipantsMemoryStoreRecord>
    private readonly ttlMs: number
    private readonly maxGroups: number
    private readonly cleanupTimer: NodeJS.Timeout

    public constructor(ttlMs = DEFAULTS.ttlMs, options: WaParticipantsMemoryStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('participants ttlMs must be a positive finite number')
        }
        this.records = new Map()
        this.ttlMs = ttlMs
        this.maxGroups = resolvePositive(
            options.maxGroups,
            DEFAULTS.maxGroups,
            'WaParticipantsMemoryStoreOptions.maxGroups'
        )
        this.cleanupTimer = setInterval(() => {
            void this.cleanupExpired(Date.now())
        }, resolveCleanupIntervalMs(ttlMs))
        this.cleanupTimer.unref()
    }

    public async upsertGroupParticipants(snapshot: WaParticipantsSnapshot): Promise<void> {
        setBoundedMapEntry(
            this.records,
            snapshot.groupJid,
            {
                ...snapshot,
                expiresAtMs: snapshot.updatedAtMs + this.ttlMs
            },
            this.maxGroups
        )
    }

    public async getGroupParticipants(
        groupJid: string,
        nowMs = Date.now()
    ): Promise<WaParticipantsSnapshot | null> {
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

    public async deleteGroupParticipants(groupJid: string): Promise<number> {
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
        clearInterval(this.cleanupTimer)
        await this.clear()
    }
}
