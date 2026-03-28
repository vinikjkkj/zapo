import type { Binary } from 'mongodb'
import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from 'zapo-js/retry'
import type { WaRetryStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface RetryRequesterStatusPayload {
    readonly eligible: readonly string[]
    readonly delivered: readonly string[]
}

interface OutboundDoc {
    _id: { session_id: string; message_id: string }
    to_jid: string
    participant_jid: string | null
    recipient_jid: string | null
    message_type: string
    replay_mode: string
    replay_payload: Binary
    requesters_json: string | null
    state: string
    created_at_ms: number
    updated_at_ms: number
    expires_at: Date
}

interface InboundDoc {
    _id: { session_id: string; message_id: string; requester_jid: string }
    retry_count: number
    expires_at: Date
}

const DEFAULT_RETRY_TTL_MS = 60 * 1000

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export class WaRetryMongoStore extends BaseMongoStore implements WaRetryStore {
    private readonly ttlMs: number

    public constructor(options: WaMongoStorageOptions, ttlMs = DEFAULT_RETRY_TTL_MS) {
        super(options)
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            throw new Error('retry ttlMs must be a non-negative finite number')
        }
        this.ttlMs = ttlMs
    }

    protected override async createIndexes(): Promise<void> {
        const outbound = this.col<OutboundDoc>('retry_outbound_messages')
        const inbound = this.col<InboundDoc>('retry_inbound_counters')
        await Promise.all([
            outbound.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 }),
            inbound.createIndex({ expires_at: 1 }, { expireAfterSeconds: 0 })
        ])
    }

    public getTtlMs(): number {
        return this.ttlMs
    }

    public supportsRawReplayPayload(): boolean {
        return false
    }

    public async getOutboundRequesterStatus(
        messageId: string,
        requesterDeviceJid: string
    ): Promise<{
        readonly eligible: boolean
        readonly delivered: boolean
    } | null> {
        await this.ensureIndexes()
        const col = this.col<OutboundDoc>('retry_outbound_messages')
        const doc = await col.findOne({
            _id: { session_id: this.sessionId, message_id: messageId }
        })
        if (!doc) return null
        if (!doc.requesters_json) return null
        const requesters = this.parseRequesterStatusPayload(doc.requesters_json)
        if (requesters.eligible.length === 0) return null

        let isEligible = false
        for (let index = 0; index < requesters.eligible.length; index += 1) {
            if (requesters.eligible[index] === requesterDeviceJid) {
                isEligible = true
                break
            }
        }
        if (!isEligible) {
            return { eligible: false, delivered: false }
        }
        for (let index = 0; index < requesters.delivered.length; index += 1) {
            if (requesters.delivered[index] === requesterDeviceJid) {
                return { eligible: true, delivered: true }
            }
        }
        return { eligible: true, delivered: false }
    }

    public async upsertOutboundMessage(record: WaRetryOutboundMessageRecord): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<OutboundDoc>('retry_outbound_messages')
        if (!(record.replayPayload instanceof Uint8Array)) {
            throw new Error('retry_outbound_messages.replay_payload must be Uint8Array')
        }
        const requestersJson = this.serializeRequesterStatusPayload(
            record.eligibleRequesterDeviceJids,
            record.deliveredRequesterDeviceJids
        )
        await col.updateOne(
            { _id: { session_id: this.sessionId, message_id: record.messageId } },
            {
                $set: {
                    to_jid: record.toJid,
                    participant_jid: record.participantJid ?? null,
                    recipient_jid: record.recipientJid ?? null,
                    message_type: record.messageType,
                    replay_mode: record.replayMode,
                    replay_payload: toBinary(record.replayPayload),
                    requesters_json: requestersJson,
                    state: record.state,
                    created_at_ms: record.createdAtMs,
                    updated_at_ms: record.updatedAtMs,
                    expires_at: new Date(record.expiresAtMs)
                }
            },
            { upsert: true }
        )
    }

    public async deleteOutboundMessage(messageId: string): Promise<number> {
        await this.ensureIndexes()
        const col = this.col<OutboundDoc>('retry_outbound_messages')
        const result = await col.deleteOne({
            _id: { session_id: this.sessionId, message_id: messageId }
        })
        return result.deletedCount
    }

    public async getOutboundMessage(
        messageId: string
    ): Promise<WaRetryOutboundMessageRecord | null> {
        await this.ensureIndexes()
        const col = this.col<OutboundDoc>('retry_outbound_messages')
        const doc = await col.findOne({
            _id: { session_id: this.sessionId, message_id: messageId }
        })
        if (!doc) return null
        const requesters = doc.requesters_json
            ? this.parseRequesterStatusPayload(doc.requesters_json)
            : { eligible: [] as readonly string[], delivered: [] as readonly string[] }
        return {
            messageId: doc._id.message_id,
            toJid: doc.to_jid,
            participantJid: doc.participant_jid ?? undefined,
            recipientJid: doc.recipient_jid ?? undefined,
            eligibleRequesterDeviceJids:
                requesters.eligible.length > 0 ? requesters.eligible : undefined,
            deliveredRequesterDeviceJids:
                requesters.delivered.length > 0 ? requesters.delivered : undefined,
            messageType: doc.message_type,
            replayMode: doc.replay_mode as WaRetryOutboundMessageRecord['replayMode'],
            replayPayload: fromBinary(doc.replay_payload),
            state: doc.state as WaRetryOutboundState,
            createdAtMs: doc.created_at_ms,
            updatedAtMs: doc.updated_at_ms,
            expiresAtMs: doc.expires_at.getTime()
        }
    }

    public async updateOutboundMessageState(
        messageId: string,
        state: WaRetryOutboundState,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        await this.ensureIndexes()
        const col = this.col<OutboundDoc>('retry_outbound_messages')
        await col.updateOne(
            { _id: { session_id: this.sessionId, message_id: messageId } },
            {
                $set: {
                    state,
                    updated_at_ms: updatedAtMs,
                    expires_at: new Date(expiresAtMs)
                }
            }
        )
    }

    public async markOutboundRequesterDelivered(
        messageId: string,
        requesterDeviceJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        await this.withSession(async (session) => {
            const col = this.col<OutboundDoc>('retry_outbound_messages')
            const doc = await col.findOne(
                { _id: { session_id: this.sessionId, message_id: messageId } },
                { session }
            )
            if (!doc) return
            if (!doc.requesters_json) return
            const requesters = this.parseRequesterStatusPayload(doc.requesters_json)
            let isEligible = false
            for (let index = 0; index < requesters.eligible.length; index += 1) {
                if (requesters.eligible[index] === requesterDeviceJid) {
                    isEligible = true
                    break
                }
            }
            if (!isEligible) return
            for (let index = 0; index < requesters.delivered.length; index += 1) {
                if (requesters.delivered[index] === requesterDeviceJid) {
                    return
                }
            }
            const nextRequestersJson = this.serializeRequesterStatusPayload(requesters.eligible, [
                ...requesters.delivered,
                requesterDeviceJid
            ])
            await col.updateOne(
                { _id: { session_id: this.sessionId, message_id: messageId } },
                {
                    $set: {
                        requesters_json: nextRequestersJson,
                        updated_at_ms: updatedAtMs,
                        expires_at: new Date(expiresAtMs)
                    }
                },
                { session }
            )
        })
    }

    public async incrementInboundCounter(
        messageId: string,
        requesterJid: string,
        _updatedAtMs: number,
        expiresAtMs: number
    ): Promise<number> {
        await this.ensureIndexes()
        const col = this.col<InboundDoc>('retry_inbound_counters')
        const result = await col.findOneAndUpdate(
            {
                _id: {
                    session_id: this.sessionId,
                    message_id: messageId,
                    requester_jid: requesterJid
                }
            },
            {
                $inc: { retry_count: 1 },
                $set: { expires_at: new Date(expiresAtMs) }
            },
            { upsert: true, returnDocument: 'after' }
        )
        return result?.retry_count ?? 1
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        const outbound = this.col<OutboundDoc>('retry_outbound_messages')
        const inbound = this.col<InboundDoc>('retry_inbound_counters')
        await Promise.all([
            outbound.deleteMany({ '_id.session_id': this.sessionId }),
            inbound.deleteMany({ '_id.session_id': this.sessionId })
        ])
    }

    private serializeRequesterStatusPayload(
        eligibleRequesterDeviceJids: readonly string[] | undefined,
        deliveredRequesterDeviceJids: readonly string[] | undefined
    ): string | null {
        const eligible = this.toUniqueStrings(
            eligibleRequesterDeviceJids ?? [],
            'requesters_json.eligible'
        )
        if (eligible.length === 0) return null
        const eligibleSet = new Set(eligible)
        const delivered = this.toUniqueStrings(
            deliveredRequesterDeviceJids ?? [],
            'requesters_json.delivered'
        ).filter((jid) => eligibleSet.has(jid))
        const payload = delivered.length > 0 ? { eligible, delivered } : { eligible }
        return JSON.stringify(payload)
    }

    private parseRequesterStatusPayload(raw: string): RetryRequesterStatusPayload {
        const parsed = JSON.parse(raw)
        if (!isObjectRecord(parsed)) {
            throw new Error('retry_outbound_messages.requesters_json must be an object')
        }
        const eligibleRaw = parsed.eligible
        if (!Array.isArray(eligibleRaw)) {
            throw new Error('retry_outbound_messages.requesters_json.eligible must be an array')
        }
        const eligible = this.toUniqueStrings(eligibleRaw, 'requesters_json.eligible')
        const deliveredRaw = parsed.delivered
        if (deliveredRaw !== undefined && !Array.isArray(deliveredRaw)) {
            throw new Error('retry_outbound_messages.requesters_json.delivered must be an array')
        }
        const eligibleSet = new Set(eligible)
        const delivered = this.toUniqueStrings(
            Array.isArray(deliveredRaw) ? deliveredRaw : [],
            'requesters_json.delivered'
        ).filter((jid) => eligibleSet.has(jid))
        return { eligible, delivered }
    }

    private toUniqueStrings(values: readonly unknown[], field: string): readonly string[] {
        const deduped = new Set<string>()
        for (let index = 0; index < values.length; index += 1) {
            const rawValue = values[index]
            if (typeof rawValue !== 'string') {
                throw new Error(`${field} must contain only strings`)
            }
            const normalized = rawValue.trim()
            if (!normalized) continue
            deduped.add(normalized)
        }
        return Array.from(deduped)
    }
}
