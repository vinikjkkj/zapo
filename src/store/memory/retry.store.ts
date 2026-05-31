import type { Logger } from '@infra/log/types'
import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from '@retry/types'
import type { WaRetryStore } from '@store/contracts/retry.store'
import { resolvePositive } from '@util/coercion'
import {
    createPeriodicCleanup,
    type PeriodicCleanupHandle,
    setBoundedMapEntry
} from '@util/collections'

interface RetryInboundCounterRecord {
    readonly count: number
    readonly expiresAtMs: number
}

const DEFAULTS = Object.freeze({
    ttlMs: 60 * 1000,
    maxOutboundMessages: 10_000,
    maxInboundCounters: 20_000
} as const)

export interface WaRetryMemoryStoreOptions {
    readonly maxOutboundMessages?: number
    readonly maxInboundCounters?: number
    /**
     * Logger for capacity-saturation warnings. Emits a single `warn` the
     * first time either bounded map evicts an entry (signals you've hit
     * `maxOutboundMessages` / `maxInboundCounters`). Subsequent evictions
     * are silent to avoid spam.
     */
    readonly logger?: Logger
}

export class WaRetryMemoryStore implements WaRetryStore {
    private readonly outboundMessages: Map<string, WaRetryOutboundMessageRecord>
    private readonly eligibleSets: Map<string, Set<string>>
    private readonly inboundCounters: Map<string, RetryInboundCounterRecord>
    private readonly ttlMs: number
    private readonly maxOutboundMessages: number
    private readonly maxInboundCounters: number
    private readonly cleanup: PeriodicCleanupHandle
    private readonly logger: Logger | undefined
    private outboundCapacityWarned: boolean
    private inboundCapacityWarned: boolean

    public constructor(ttlMs = DEFAULTS.ttlMs, options: WaRetryMemoryStoreOptions = {}) {
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('retry ttlMs must be a positive finite number')
        }
        this.outboundMessages = new Map()
        this.eligibleSets = new Map()
        this.inboundCounters = new Map()
        this.ttlMs = ttlMs
        this.maxOutboundMessages = resolvePositive(
            options.maxOutboundMessages,
            DEFAULTS.maxOutboundMessages,
            'WaRetryMemoryStoreOptions.maxOutboundMessages'
        )
        this.maxInboundCounters = resolvePositive(
            options.maxInboundCounters,
            DEFAULTS.maxInboundCounters,
            'WaRetryMemoryStoreOptions.maxInboundCounters'
        )
        this.logger = options.logger
        this.outboundCapacityWarned = false
        this.inboundCapacityWarned = false
        this.cleanup = createPeriodicCleanup(this.ttlMs, () => {
            void this.cleanupExpired(Date.now())
        })
    }

    private warnOutboundCapacity(): void {
        if (this.outboundCapacityWarned || !this.logger) return
        this.outboundCapacityWarned = true
        this.logger.warn('retry outbound store at capacity, evicting oldest', {
            max: this.maxOutboundMessages
        })
    }

    private warnInboundCapacity(): void {
        if (this.inboundCapacityWarned || !this.logger) return
        this.inboundCapacityWarned = true
        this.logger.warn('retry inbound counters at capacity, evicting oldest', {
            max: this.maxInboundCounters
        })
    }

    public getTtlMs(): number {
        return this.ttlMs
    }

    public supportsRawReplayPayload(): boolean {
        return true
    }

    public async getOutboundRequesterStatus(
        messageId: string,
        requesterDeviceJid: string
    ): Promise<{
        readonly eligible: boolean
        readonly delivered: boolean
    } | null> {
        const current = this.outboundMessages.get(messageId)
        if (!current) {
            return null
        }
        const eligible = current.eligibleRequesterDeviceJids
        if (!eligible || eligible.length === 0) {
            return null
        }
        const eligibleSet = this.eligibleSets.get(current.messageId)
        let isEligible = false
        if (eligibleSet) {
            isEligible = eligibleSet.has(requesterDeviceJid)
        } else {
            for (let index = 0; index < eligible.length; index += 1) {
                if (eligible[index] === requesterDeviceJid) {
                    isEligible = true
                    break
                }
            }
        }
        if (!isEligible) {
            return { eligible: false, delivered: false }
        }
        const delivered = current.deliveredRequesterDeviceJids
        if (!delivered || delivered.length === 0) {
            return { eligible: true, delivered: false }
        }
        for (let index = 0; index < delivered.length; index += 1) {
            if (delivered[index] === requesterDeviceJid) {
                return { eligible: true, delivered: true }
            }
        }
        return { eligible: true, delivered: false }
    }

    public async upsertOutboundMessage(record: WaRetryOutboundMessageRecord): Promise<void> {
        const storedRecord: WaRetryOutboundMessageRecord = {
            ...record,
            eligibleRequesterDeviceJids: record.eligibleRequesterDeviceJids
                ? [...record.eligibleRequesterDeviceJids]
                : undefined,
            deliveredRequesterDeviceJids: record.deliveredRequesterDeviceJids
                ? [...record.deliveredRequesterDeviceJids]
                : undefined
        }
        setBoundedMapEntry(
            this.outboundMessages,
            record.messageId,
            storedRecord,
            this.maxOutboundMessages,
            (messageId) => {
                this.eligibleSets.delete(messageId)
                this.warnOutboundCapacity()
            }
        )
        if (record.eligibleRequesterDeviceJids && record.eligibleRequesterDeviceJids.length > 0) {
            this.eligibleSets.set(record.messageId, new Set(record.eligibleRequesterDeviceJids))
        } else {
            this.eligibleSets.delete(record.messageId)
        }
    }

    public async deleteOutboundMessage(messageId: string): Promise<number> {
        const existed = this.outboundMessages.delete(messageId)
        this.eligibleSets.delete(messageId)
        return existed ? 1 : 0
    }

    public async getOutboundMessage(
        messageId: string
    ): Promise<WaRetryOutboundMessageRecord | null> {
        return this.outboundMessages.get(messageId) ?? null
    }

    public async updateOutboundMessageState(
        messageId: string,
        state: WaRetryOutboundState,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        const current = this.outboundMessages.get(messageId)
        if (!current) {
            return
        }
        setBoundedMapEntry(
            this.outboundMessages,
            messageId,
            {
                ...current,
                state,
                updatedAtMs,
                expiresAtMs
            },
            this.maxOutboundMessages,
            (evictedMessageId) => {
                this.eligibleSets.delete(evictedMessageId)
                this.warnOutboundCapacity()
            }
        )
    }

    public async markOutboundRequesterDelivered(
        messageId: string,
        requesterDeviceJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        const current = this.outboundMessages.get(messageId)
        if (!current) {
            return
        }
        const delivered = new Set(current.deliveredRequesterDeviceJids ?? [])
        delivered.add(requesterDeviceJid)
        setBoundedMapEntry(
            this.outboundMessages,
            messageId,
            {
                ...current,
                deliveredRequesterDeviceJids: Array.from(delivered),
                updatedAtMs,
                expiresAtMs
            },
            this.maxOutboundMessages,
            (evictedMessageId) => {
                this.eligibleSets.delete(evictedMessageId)
                this.warnOutboundCapacity()
            }
        )
    }

    public async incrementInboundCounter(
        messageId: string,
        requesterJid: string,
        _updatedAtMs: number,
        expiresAtMs: number
    ): Promise<number> {
        const key = this.counterKey(messageId, requesterJid)
        const current = this.inboundCounters.get(key)
        const count = current ? current.count + 1 : 1
        setBoundedMapEntry(
            this.inboundCounters,
            key,
            { count, expiresAtMs },
            this.maxInboundCounters,
            () => this.warnInboundCapacity()
        )
        return count
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        let removed = 0

        for (const [messageId, record] of this.outboundMessages) {
            if (record.expiresAtMs > nowMs) continue
            this.outboundMessages.delete(messageId)
            this.eligibleSets.delete(messageId)
            removed += 1
        }
        for (const [key, record] of this.inboundCounters) {
            if (record.expiresAtMs > nowMs) continue
            this.inboundCounters.delete(key)
            removed += 1
        }
        return removed
    }

    public async clear(): Promise<void> {
        this.outboundMessages.clear()
        this.eligibleSets.clear()
        this.inboundCounters.clear()
    }

    public async destroy(): Promise<void> {
        this.cleanup.destroy()
        await this.clear()
    }

    private counterKey(messageId: string, requesterJid: string): string {
        return `${messageId}|${requesterJid}`
    }
}
