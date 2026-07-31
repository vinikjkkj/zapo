import type { Logger } from '@infra/log/types'
import type {
    WaChatMetadataSnapshot,
    WaChatMetadataStore
} from '@store/contracts/chat-metadata.store'
import { resolvePositive } from '@util/coercion'
import {
    createPeriodicCleanup,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

interface WaChatMetadataMemoryStoreRecord extends WaChatMetadataSnapshot {
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 30 * 60 * 1000,
    maxChats: 2_048
} as const)

export interface WaChatMetadataMemoryStoreOptions {
    readonly maxChats?: number
    /**
     * Logger for capacity-saturation warnings. Emits a single `warn` the first
     * time the bounded map evicts an entry; later evictions are silent.
     */
    readonly logger?: Logger
}

export class WaChatMetadataMemoryStore implements WaChatMetadataStore {
    private readonly records: Map<string, WaChatMetadataMemoryStoreRecord>
    private readonly ttlMs: number
    private readonly maxChats: number
    private readonly cleanup: PeriodicCleanupHandle
    private readonly logger: Logger | undefined
    private capacityWarned: boolean

    public constructor(ttlMs = DEFAULTS.ttlMs, options: WaChatMetadataMemoryStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('chatMetadata ttlMs must be a positive finite number')
        }
        this.records = new Map()
        this.ttlMs = ttlMs
        this.maxChats = resolvePositive(
            options.maxChats,
            DEFAULTS.maxChats,
            'WaChatMetadataMemoryStoreOptions.maxChats'
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
        this.logger.warn('chat metadata store at capacity, evicting oldest', {
            max: this.maxChats
        })
    }

    public async upsertChatMetadata(snapshot: WaChatMetadataSnapshot): Promise<void> {
        setBoundedMapEntry(
            this.records,
            snapshot.chatJid,
            {
                ...snapshot,
                expiresAtMs: snapshot.updatedAtMs + this.ttlMs
            },
            this.maxChats,
            () => this.warnCapacity()
        )
    }

    public async getChatMetadata(
        chatJid: string,
        nowMs = Date.now()
    ): Promise<WaChatMetadataSnapshot | null> {
        const record = this.records.get(chatJid)
        if (!record) {
            return null
        }
        if (record.expiresAtMs <= nowMs) {
            this.records.delete(chatJid)
            return null
        }
        return record
    }

    public async deleteChatMetadata(chatJid: string): Promise<number> {
        return this.records.delete(chatJid) ? 1 : 0
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        let removed = 0
        for (const [chatJid, record] of this.records) {
            if (record.expiresAtMs > nowMs) continue
            this.records.delete(chatJid)
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
