import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from 'zapo-js/retry'
import type { WaRetryStore } from 'zapo-js/store'
import { asBytes, asNumber, asOptionalString, asString } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteStorageOptions } from './types'

interface RetryOutboundRow extends Record<string, unknown> {
    readonly message_id: unknown
    readonly to_jid: unknown
    readonly participant_jid: unknown
    readonly recipient_jid: unknown
    readonly message_type: unknown
    readonly replay_mode: unknown
    readonly replay_payload: unknown
    readonly requesters_json: unknown
    readonly state: unknown
    readonly created_at_ms: unknown
    readonly updated_at_ms: unknown
    readonly expires_at_ms: unknown
}

interface RetryRequesterStatusPayload {
    readonly eligible: readonly string[]
    readonly delivered: readonly string[]
}

const DEFAULT_RETRY_TTL_MS = 60 * 1000

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export class WaRetrySqliteStore extends BaseSqliteStore implements WaRetryStore {
    private readonly ttlMs: number

    public constructor(options: WaSqliteStorageOptions, ttlMs = DEFAULT_RETRY_TTL_MS) {
        super(options, ['retry'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('retry ttlMs must be a positive finite number')
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
        const db = await this.getConnection()
        const row = db.get<Record<string, unknown>>(
            `SELECT requesters_json
             FROM retry_outbound_messages
             WHERE session_id = ? AND message_id = ?
             LIMIT 1`,
            [this.options.sessionId, messageId]
        )
        if (!row) {
            return null
        }
        const requestersJson = asOptionalString(
            row.requesters_json,
            'retry_outbound_messages.requesters_json'
        )
        if (!requestersJson) {
            return null
        }
        const requesters = this.parseRequesterStatusPayload(requestersJson)
        if (requesters.eligible.length === 0) {
            return null
        }
        let isEligible = false
        for (let index = 0; index < requesters.eligible.length; index += 1) {
            if (requesters.eligible[index] === requesterDeviceJid) {
                isEligible = true
                break
            }
        }
        if (!isEligible) {
            return {
                eligible: false,
                delivered: false
            }
        }
        for (let index = 0; index < requesters.delivered.length; index += 1) {
            if (requesters.delivered[index] === requesterDeviceJid) {
                return {
                    eligible: true,
                    delivered: true
                }
            }
        }
        return {
            eligible: true,
            delivered: false
        }
    }

    public async upsertOutboundMessage(record: WaRetryOutboundMessageRecord): Promise<void> {
        const requestersJson = this.serializeRequesterStatusPayload(
            record.eligibleRequesterDeviceJids,
            record.deliveredRequesterDeviceJids
        )
        if (!(record.replayPayload instanceof Uint8Array)) {
            throw new Error('retry_outbound_messages.replay_payload must be Uint8Array')
        }
        const replayPayload = record.replayPayload
        const db = await this.getConnection()
        db.run(
            `INSERT INTO retry_outbound_messages (
                session_id,
                message_id,
                to_jid,
                participant_jid,
                recipient_jid,
                message_type,
                replay_mode,
                replay_payload,
                requesters_json,
                state,
                created_at_ms,
                updated_at_ms,
                expires_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, message_id) DO UPDATE SET
                to_jid=excluded.to_jid,
                participant_jid=excluded.participant_jid,
                recipient_jid=excluded.recipient_jid,
                message_type=excluded.message_type,
                replay_mode=excluded.replay_mode,
                replay_payload=excluded.replay_payload,
                requesters_json=excluded.requesters_json,
                state=excluded.state,
                created_at_ms=excluded.created_at_ms,
                updated_at_ms=excluded.updated_at_ms,
                expires_at_ms=excluded.expires_at_ms`,
            [
                this.options.sessionId,
                record.messageId,
                record.toJid,
                record.participantJid ?? null,
                record.recipientJid ?? null,
                record.messageType,
                record.replayMode,
                replayPayload,
                requestersJson,
                record.state,
                record.createdAtMs,
                record.updatedAtMs,
                record.expiresAtMs
            ]
        )
    }

    public async deleteOutboundMessage(messageId: string): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM retry_outbound_messages
             WHERE session_id = ? AND message_id = ?`,
            [this.options.sessionId, messageId]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async getOutboundMessage(
        messageId: string
    ): Promise<WaRetryOutboundMessageRecord | null> {
        const db = await this.getConnection()
        const row = db.get<RetryOutboundRow>(
            `SELECT
                message_id,
                to_jid,
                participant_jid,
                recipient_jid,
                message_type,
                replay_mode,
                replay_payload,
                requesters_json,
                state,
                created_at_ms,
                updated_at_ms,
                expires_at_ms
            FROM retry_outbound_messages
            WHERE session_id = ? AND message_id = ?`,
            [this.options.sessionId, messageId]
        )
        if (!row) {
            return null
        }
        const requestersJson = asOptionalString(
            row.requesters_json,
            'retry_outbound_messages.requesters_json'
        )
        const requesters = requestersJson
            ? this.parseRequesterStatusPayload(requestersJson)
            : {
                  eligible: [] as readonly string[],
                  delivered: [] as readonly string[]
              }
        return {
            messageId: asString(row.message_id, 'retry_outbound_messages.message_id'),
            toJid: asString(row.to_jid, 'retry_outbound_messages.to_jid'),
            participantJid: asOptionalString(
                row.participant_jid,
                'retry_outbound_messages.participant_jid'
            ),
            recipientJid: asOptionalString(
                row.recipient_jid,
                'retry_outbound_messages.recipient_jid'
            ),
            eligibleRequesterDeviceJids:
                requesters.eligible.length > 0 ? requesters.eligible : undefined,
            deliveredRequesterDeviceJids:
                requesters.delivered.length > 0 ? requesters.delivered : undefined,
            messageType: asString(row.message_type, 'retry_outbound_messages.message_type'),
            replayMode: asString(
                row.replay_mode,
                'retry_outbound_messages.replay_mode'
            ) as WaRetryOutboundMessageRecord['replayMode'],
            replayPayload: asBytes(row.replay_payload, 'retry_outbound_messages.replay_payload'),
            state: asString(row.state, 'retry_outbound_messages.state') as WaRetryOutboundState,
            createdAtMs: asNumber(row.created_at_ms, 'retry_outbound_messages.created_at_ms'),
            updatedAtMs: asNumber(row.updated_at_ms, 'retry_outbound_messages.updated_at_ms'),
            expiresAtMs: asNumber(row.expires_at_ms, 'retry_outbound_messages.expires_at_ms')
        }
    }

    public async updateOutboundMessageState(
        messageId: string,
        state: WaRetryOutboundState,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `UPDATE retry_outbound_messages
             SET state = ?, updated_at_ms = ?, expires_at_ms = ?
             WHERE session_id = ? AND message_id = ?`,
            [state, updatedAtMs, expiresAtMs, this.options.sessionId, messageId]
        )
    }

    public async markOutboundRequesterDelivered(
        messageId: string,
        requesterDeviceJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        await this.withTransaction((db) => {
            const row = db.get<Record<string, unknown>>(
                `SELECT requesters_json
                 FROM retry_outbound_messages
                 WHERE session_id = ? AND message_id = ?
                 LIMIT 1`,
                [this.options.sessionId, messageId]
            )
            if (!row) {
                return
            }
            const requestersJson = asOptionalString(
                row.requesters_json,
                'retry_outbound_messages.requesters_json'
            )
            if (!requestersJson) {
                return
            }
            const requesters = this.parseRequesterStatusPayload(requestersJson)
            let isEligible = false
            for (let index = 0; index < requesters.eligible.length; index += 1) {
                if (requesters.eligible[index] === requesterDeviceJid) {
                    isEligible = true
                    break
                }
            }
            if (!isEligible) {
                return
            }
            for (let index = 0; index < requesters.delivered.length; index += 1) {
                if (requesters.delivered[index] === requesterDeviceJid) {
                    return
                }
            }
            const nextRequestersJson = this.serializeRequesterStatusPayload(requesters.eligible, [
                ...requesters.delivered,
                requesterDeviceJid
            ])
            db.run(
                `UPDATE retry_outbound_messages
                 SET requesters_json = ?, updated_at_ms = ?, expires_at_ms = ?
                 WHERE session_id = ? AND message_id = ?`,
                [nextRequestersJson, updatedAtMs, expiresAtMs, this.options.sessionId, messageId]
            )
        })
    }

    public async incrementInboundCounter(
        messageId: string,
        requesterJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<number> {
        const db = await this.getConnection()
        const row = db.get<Record<string, unknown>>(
            `INSERT INTO retry_inbound_counters (
                session_id,
                message_id,
                requester_jid,
                retry_count,
                updated_at_ms,
                expires_at_ms
            ) VALUES (?, ?, ?, 1, ?, ?)
            ON CONFLICT(session_id, message_id, requester_jid) DO UPDATE SET
                retry_count=retry_inbound_counters.retry_count + 1,
                updated_at_ms=excluded.updated_at_ms,
                expires_at_ms=excluded.expires_at_ms
            RETURNING retry_count`,
            [this.options.sessionId, messageId, requesterJid, updatedAtMs, expiresAtMs]
        )
        if (!row) {
            return 1
        }
        return asNumber(row.retry_count, 'retry_inbound_counters.retry_count')
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        return this.withTransaction((db) => {
            db.run(
                `DELETE FROM retry_outbound_messages
                 WHERE session_id = ? AND expires_at_ms <= ?`,
                [this.options.sessionId, nowMs]
            )
            const outboundCountRow = db.get<Record<string, unknown>>(
                'SELECT changes() AS total',
                []
            )
            const outboundCount = outboundCountRow
                ? asNumber(outboundCountRow.total, 'retry_outbound_messages.changes')
                : 0
            db.run(
                `DELETE FROM retry_inbound_counters
                 WHERE session_id = ? AND expires_at_ms <= ?`,
                [this.options.sessionId, nowMs]
            )
            const inboundCountRow = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
            const inboundCount = inboundCountRow
                ? asNumber(inboundCountRow.total, 'retry_inbound_counters.changes')
                : 0
            return outboundCount + inboundCount
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM retry_outbound_messages WHERE session_id = ?', [
                this.options.sessionId
            ])
            db.run('DELETE FROM retry_inbound_counters WHERE session_id = ?', [
                this.options.sessionId
            ])
        })
    }

    private serializeRequesterStatusPayload(
        eligibleRequesterDeviceJids: readonly string[] | undefined,
        deliveredRequesterDeviceJids: readonly string[] | undefined
    ): string | null {
        const eligible = this.toUniqueStrings(
            eligibleRequesterDeviceJids ?? [],
            'requesters_json.eligible'
        )
        if (eligible.length === 0) {
            return null
        }
        const eligibleSet = new Set(eligible)
        const delivered = this.toUniqueStrings(
            deliveredRequesterDeviceJids ?? [],
            'requesters_json.delivered'
        ).filter((jid) => eligibleSet.has(jid))
        const payload =
            delivered.length > 0
                ? {
                      eligible,
                      delivered
                  }
                : {
                      eligible
                  }
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
        return {
            eligible,
            delivered
        }
    }

    private toUniqueStrings(values: readonly unknown[], field: string): readonly string[] {
        const deduped = new Set<string>()
        for (let index = 0; index < values.length; index += 1) {
            const rawValue = values[index]
            if (typeof rawValue !== 'string') {
                throw new Error(`${field} must contain only strings`)
            }
            const normalized = rawValue.trim()
            if (!normalized) {
                continue
            }
            deduped.add(normalized)
        }
        return Array.from(deduped)
    }
}
