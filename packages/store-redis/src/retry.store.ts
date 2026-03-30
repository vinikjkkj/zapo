import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from 'zapo-js/retry'
import type { WaRetryStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import {
    deleteKeysChunked,
    scanKeys,
    toBytesOrNull,
    toRedisBuffer,
    toStringOrNull
} from './helpers'
import type { WaRedisStorageOptions } from './types'

interface RetryRequesterStatusPayload {
    readonly eligible: readonly string[]
    readonly delivered: readonly string[]
}

const DEFAULT_RETRY_TTL_MS = 60 * 1000

const LUA_INCREMENT_INBOUND = `
local key = KEYS[1]
local count = redis.call('HINCRBY', key, 'retry_count', 1)
redis.call('HSET', key, 'updated_at_ms', ARGV[1])
redis.call('PEXPIREAT', key, tonumber(ARGV[2]))
return count
`

const LUA_MARK_DELIVERED = `
local key = KEYS[1]
local replayKey = KEYS[2]
local requester = ARGV[1]
local updatedAtMs = ARGV[2]
local expiresAtMs = tonumber(ARGV[3])
local raw = redis.call('HGET', key, 'requesters_json')
if not raw then
    return 0
end
local requesters = cjson.decode(raw)
if not requesters.eligible then
    return 0
end
local isEligible = false
for _, v in ipairs(requesters.eligible) do
    if v == requester then
        isEligible = true
        break
    end
end
if not isEligible then
    return 0
end
if not requesters.delivered then
    requesters.delivered = {}
end
for _, v in ipairs(requesters.delivered) do
    if v == requester then
        return 0
    end
end
table.insert(requesters.delivered, requester)
redis.call('HSET', key, 'requesters_json', cjson.encode(requesters))
redis.call('HSET', key, 'updated_at_ms', updatedAtMs)
redis.call('PEXPIREAT', key, expiresAtMs)
redis.call('PEXPIREAT', replayKey, expiresAtMs)
return 1
`

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export class WaRetryRedisStore extends BaseRedisStore implements WaRetryStore {
    private readonly ttlMs: number

    public constructor(options: WaRedisStorageOptions, ttlMs = DEFAULT_RETRY_TTL_MS) {
        super(options)
        if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0) {
            throw new Error('retry ttlMs must be a positive integer')
        }
        this.ttlMs = ttlMs
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
        const key = this.k('retry:out', this.sessionId, messageId)
        const raw = await this.redis.hget(key, 'requesters_json')
        if (!raw) return null

        const requesters = this.parseRequesterStatusPayload(raw)
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
        const key = this.k('retry:out', this.sessionId, record.messageId)
        if (!(record.replayPayload instanceof Uint8Array)) {
            throw new Error('retry_outbound_messages.replay_payload must be Uint8Array')
        }
        const requestersJson = this.serializeRequesterStatusPayload(
            record.eligibleRequesterDeviceJids,
            record.deliveredRequesterDeviceJids
        )
        const fields: Record<string, string> = {
            message_id: record.messageId,
            to_jid: record.toJid,
            message_type: record.messageType,
            replay_mode: record.replayMode,
            state: record.state,
            created_at_ms: String(record.createdAtMs),
            updated_at_ms: String(record.updatedAtMs),
            expires_at_ms: String(record.expiresAtMs)
        }
        if (record.participantJid !== undefined) {
            fields.participant_jid = record.participantJid
        }
        if (record.recipientJid !== undefined) {
            fields.recipient_jid = record.recipientJid
        }
        if (requestersJson !== null) {
            fields.requesters_json = requestersJson
        }

        const ttl = record.expiresAtMs - Date.now()
        if (ttl <= 0) {
            const pipeline = this.redis.pipeline()
            pipeline.del(key)
            pipeline.del(`${key}:replay_payload`)
            await pipeline.exec()
            return
        }

        const pipeline = this.redis.pipeline()
        pipeline.hset(key, fields)
        pipeline.set(`${key}:replay_payload`, toRedisBuffer(record.replayPayload))
        pipeline.pexpire(key, ttl)
        pipeline.pexpire(`${key}:replay_payload`, ttl)
        await pipeline.exec()
    }

    public async deleteOutboundMessage(messageId: string): Promise<number> {
        const key = this.k('retry:out', this.sessionId, messageId)
        const pipeline = this.redis.pipeline()
        pipeline.del(key)
        pipeline.del(`${key}:replay_payload`)
        const results = await pipeline.exec()
        if (!results) return 0
        return (results[0][1] as number) > 0 ? 1 : 0
    }

    public async getOutboundMessage(
        messageId: string
    ): Promise<WaRetryOutboundMessageRecord | null> {
        const key = this.k('retry:out', this.sessionId, messageId)

        const pipeline = this.redis.pipeline()
        pipeline.hgetall(key)
        pipeline.getBuffer(`${key}:replay_payload`)
        const results = await pipeline.exec()
        if (!results) return null

        const data = results[0][1] as Record<string, string>
        if (!data || Object.keys(data).length === 0) return null

        const replayPayload = toBytesOrNull(results[1][1])
        if (!replayPayload) return null

        const requestersJson = toStringOrNull(data.requesters_json)
        const requesters = requestersJson
            ? this.parseRequesterStatusPayload(requestersJson)
            : { eligible: [] as readonly string[], delivered: [] as readonly string[] }

        return {
            messageId: data.message_id,
            toJid: data.to_jid,
            participantJid: toStringOrNull(data.participant_jid) ?? undefined,
            recipientJid: toStringOrNull(data.recipient_jid) ?? undefined,
            eligibleRequesterDeviceJids:
                requesters.eligible.length > 0 ? requesters.eligible : undefined,
            deliveredRequesterDeviceJids:
                requesters.delivered.length > 0 ? requesters.delivered : undefined,
            messageType: data.message_type,
            replayMode: data.replay_mode as WaRetryOutboundMessageRecord['replayMode'],
            replayPayload,
            state: data.state as WaRetryOutboundState,
            createdAtMs: Number(data.created_at_ms),
            updatedAtMs: Number(data.updated_at_ms),
            expiresAtMs: Number(data.expires_at_ms)
        }
    }

    public async updateOutboundMessageState(
        messageId: string,
        state: WaRetryOutboundState,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        const key = this.k('retry:out', this.sessionId, messageId)
        const exists = await this.redis.exists(key)
        if (!exists) return

        const ttl = expiresAtMs - Date.now()
        const pipeline = this.redis.pipeline()
        pipeline.hset(key, {
            state,
            updated_at_ms: String(updatedAtMs),
            expires_at_ms: String(expiresAtMs)
        })
        if (ttl > 0) {
            pipeline.pexpire(key, ttl)
            pipeline.pexpire(`${key}:replay_payload`, ttl)
        }
        await pipeline.exec()
    }

    public async markOutboundRequesterDelivered(
        messageId: string,
        requesterDeviceJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        const key = this.k('retry:out', this.sessionId, messageId)
        const replayKey = `${key}:replay_payload`
        await this.redis.eval(
            LUA_MARK_DELIVERED,
            2,
            key,
            replayKey,
            requesterDeviceJid,
            String(updatedAtMs),
            String(expiresAtMs)
        )
    }

    public async incrementInboundCounter(
        messageId: string,
        requesterJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<number> {
        const key = this.k('retry:in', this.sessionId, messageId, requesterJid)
        const count = await this.redis.eval(
            LUA_INCREMENT_INBOUND,
            1,
            key,
            String(updatedAtMs),
            String(expiresAtMs)
        )
        return Number(count)
    }

    public async cleanupExpired(_nowMs: number): Promise<number> {
        return 0
    }

    public async clear(): Promise<void> {
        const outPattern = this.k('retry:out', this.sessionId, '*')
        const inPattern = this.k('retry:in', this.sessionId, '*')
        const [outKeys, inKeys] = await Promise.all([
            scanKeys(this.redis, outPattern),
            scanKeys(this.redis, inPattern)
        ])
        const allKeys = [...outKeys, ...inKeys]
        if (allKeys.length > 0) {
            await deleteKeysChunked(this.redis, allKeys)
        }
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
            throw new Error('requesters_json must be an object')
        }
        const eligibleRaw = parsed.eligible
        if (!Array.isArray(eligibleRaw)) {
            throw new Error('requesters_json.eligible must be an array')
        }
        const eligible = this.toUniqueStrings(eligibleRaw, 'requesters_json.eligible')
        const deliveredRaw = parsed.delivered
        if (deliveredRaw !== undefined && !Array.isArray(deliveredRaw)) {
            throw new Error('requesters_json.delivered must be an array')
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
