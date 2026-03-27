import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from '@retry/types'
import type { WaRetryStore } from '@store/contracts/retry.store'
import { resolveCleanupIntervalMs } from '@util/collections'

interface RetryInboundCounterRecord {
    count: number
    expiresAtMs: number
}

const DEFAULT_RETRY_TTL_MS = 60 * 1000

export class WaRetryMemoryStore implements WaRetryStore {
    private readonly outboundMessages: Map<string, WaRetryOutboundMessageRecord>
    private readonly eligibleSets: Map<string, Set<string>>
    private readonly inboundCounters: Map<string, RetryInboundCounterRecord>
    private readonly ttlMs: number
    private readonly cleanupTimer: NodeJS.Timeout

    public constructor(ttlMs = DEFAULT_RETRY_TTL_MS) {
        this.outboundMessages = new Map()
        this.eligibleSets = new Map()
        this.inboundCounters = new Map()
        this.ttlMs = ttlMs
        this.cleanupTimer = setInterval(() => {
            void this.cleanupExpired(Date.now())
        }, resolveCleanupIntervalMs(ttlMs))
        this.cleanupTimer.unref()
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
        this.outboundMessages.set(record.messageId, {
            ...record,
            eligibleRequesterDeviceJids: record.eligibleRequesterDeviceJids
                ? [...record.eligibleRequesterDeviceJids]
                : undefined,
            deliveredRequesterDeviceJids: record.deliveredRequesterDeviceJids
                ? [...record.deliveredRequesterDeviceJids]
                : undefined
        })
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
        this.outboundMessages.set(messageId, {
            ...current,
            state,
            updatedAtMs,
            expiresAtMs
        })
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
        this.outboundMessages.set(messageId, {
            ...current,
            deliveredRequesterDeviceJids: Array.from(delivered),
            updatedAtMs,
            expiresAtMs
        })
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
        this.inboundCounters.set(key, {
            count,
            expiresAtMs
        })
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
        clearInterval(this.cleanupTimer)
        await this.clear()
    }

    private counterKey(messageId: string, requesterJid: string): string {
        return `${messageId}|${requesterJid}`
    }
}
