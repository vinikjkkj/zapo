import type { WaRetryOutboundMessageRecord, WaRetryOutboundState } from 'zapo-js/retry'
import type { WaRetryStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryFirst, toBytes } from './helpers'
import type { WaPgStorageOptions } from './types'

interface RetryRequesterStatusPayload {
    readonly eligible: readonly string[]
    readonly delivered: readonly string[]
}

const DEFAULT_RETRY_TTL_MS = 60 * 1000

function isObjectRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}

export class WaRetryPgStore extends BasePgStore implements WaRetryStore {
    private readonly ttlMs: number

    public constructor(options: WaPgStorageOptions, ttlMs = DEFAULT_RETRY_TTL_MS) {
        super(options, ['retry'])
        if (!Number.isFinite(ttlMs) || ttlMs < 0) {
            throw new Error('retry ttlMs must be a non-negative finite number')
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
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('retry_get_requester_status'),
                text: `SELECT requesters_json
                 FROM ${this.t('retry_outbound_messages')}
                 WHERE session_id = $1 AND message_id = $2
                 LIMIT 1`,
                values: [this.sessionId, messageId]
            })
        )
        if (!row) {
            return null
        }
        const requestersJson = row.requesters_json !== null ? String(row.requesters_json) : null
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
        await this.ensureReady()
        const requestersJson = this.serializeRequesterStatusPayload(
            record.eligibleRequesterDeviceJids,
            record.deliveredRequesterDeviceJids
        )
        if (!(record.replayPayload instanceof Uint8Array)) {
            throw new Error('retry_outbound_messages.replay_payload must be Uint8Array')
        }
        const replayPayload = record.replayPayload
        await this.pool.query({
            name: this.stmtName('retry_upsert_outbound'),
            text: `INSERT INTO ${this.t('retry_outbound_messages')} (
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
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (session_id, message_id) DO UPDATE SET
                to_jid = EXCLUDED.to_jid,
                participant_jid = EXCLUDED.participant_jid,
                recipient_jid = EXCLUDED.recipient_jid,
                message_type = EXCLUDED.message_type,
                replay_mode = EXCLUDED.replay_mode,
                replay_payload = EXCLUDED.replay_payload,
                requesters_json = EXCLUDED.requesters_json,
                state = EXCLUDED.state,
                created_at_ms = EXCLUDED.created_at_ms,
                updated_at_ms = EXCLUDED.updated_at_ms,
                expires_at_ms = EXCLUDED.expires_at_ms`,
            values: [
                this.sessionId,
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
        })
    }

    public async deleteOutboundMessage(messageId: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('retry_delete_outbound'),
                text: `DELETE FROM ${this.t('retry_outbound_messages')}
                 WHERE session_id = $1 AND message_id = $2`,
                values: [this.sessionId, messageId]
            })
        )
    }

    public async getOutboundMessage(
        messageId: string
    ): Promise<WaRetryOutboundMessageRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('retry_get_outbound'),
                text: `SELECT
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
                FROM ${this.t('retry_outbound_messages')}
                WHERE session_id = $1 AND message_id = $2`,
                values: [this.sessionId, messageId]
            })
        )
        if (!row) {
            return null
        }
        const requestersJson = row.requesters_json !== null ? String(row.requesters_json) : null
        const requesters = requestersJson
            ? this.parseRequesterStatusPayload(requestersJson)
            : {
                  eligible: [] as readonly string[],
                  delivered: [] as readonly string[]
              }
        return {
            messageId: String(row.message_id),
            toJid: String(row.to_jid),
            participantJid: row.participant_jid !== null ? String(row.participant_jid) : undefined,
            recipientJid: row.recipient_jid !== null ? String(row.recipient_jid) : undefined,
            eligibleRequesterDeviceJids:
                requesters.eligible.length > 0 ? requesters.eligible : undefined,
            deliveredRequesterDeviceJids:
                requesters.delivered.length > 0 ? requesters.delivered : undefined,
            messageType: String(row.message_type),
            replayMode: String(row.replay_mode) as WaRetryOutboundMessageRecord['replayMode'],
            replayPayload: toBytes(row.replay_payload),
            state: String(row.state) as WaRetryOutboundState,
            createdAtMs: Number(row.created_at_ms),
            updatedAtMs: Number(row.updated_at_ms),
            expiresAtMs: Number(row.expires_at_ms)
        }
    }

    public async updateOutboundMessageState(
        messageId: string,
        state: WaRetryOutboundState,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('retry_update_outbound_state'),
            text: `UPDATE ${this.t('retry_outbound_messages')}
             SET state = $1, updated_at_ms = $2, expires_at_ms = $3
             WHERE session_id = $4 AND message_id = $5`,
            values: [state, updatedAtMs, expiresAtMs, this.sessionId, messageId]
        })
    }

    public async markOutboundRequesterDelivered(
        messageId: string,
        requesterDeviceJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<void> {
        await this.withTransaction(async (client) => {
            const row = queryFirst(
                await client.query({
                    name: this.stmtName('retry_select_requesters_for_update'),
                    text: `SELECT requesters_json
                     FROM ${this.t('retry_outbound_messages')}
                     WHERE session_id = $1 AND message_id = $2
                     FOR UPDATE`,
                    values: [this.sessionId, messageId]
                })
            )
            if (!row) {
                return
            }
            const requestersJson = row.requesters_json !== null ? String(row.requesters_json) : null
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
            await client.query({
                name: this.stmtName('retry_update_requesters'),
                text: `UPDATE ${this.t('retry_outbound_messages')}
                 SET requesters_json = $1, updated_at_ms = $2, expires_at_ms = $3
                 WHERE session_id = $4 AND message_id = $5`,
                values: [nextRequestersJson, updatedAtMs, expiresAtMs, this.sessionId, messageId]
            })
        })
    }

    public async incrementInboundCounter(
        messageId: string,
        requesterJid: string,
        updatedAtMs: number,
        expiresAtMs: number
    ): Promise<number> {
        await this.ensureReady()
        const tbl = this.t('retry_inbound_counters')
        const result = await this.pool.query({
            name: this.stmtName('retry_inc_inbound'),
            text: `INSERT INTO ${tbl} (
                session_id, message_id, requester_jid, retry_count, updated_at_ms, expires_at_ms
            ) VALUES ($1, $2, $3, 1, $4, $5)
            ON CONFLICT (session_id, message_id, requester_jid) DO UPDATE SET
                retry_count = ${tbl}.retry_count + 1,
                updated_at_ms = EXCLUDED.updated_at_ms,
                expires_at_ms = EXCLUDED.expires_at_ms
            RETURNING retry_count`,
            values: [this.sessionId, messageId, requesterJid, updatedAtMs, expiresAtMs]
        })
        const row = queryFirst(result)
        return row ? Number(row.retry_count) : 1
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        const outboundCount = affectedRows(
            await this.pool.query({
                name: this.stmtName('retry_cleanup_outbound'),
                text: `DELETE FROM ${this.t('retry_outbound_messages')}
                 WHERE session_id = $1 AND expires_at_ms <= $2`,
                values: [this.sessionId, nowMs]
            })
        )
        const inboundCount = affectedRows(
            await this.pool.query({
                name: this.stmtName('retry_cleanup_inbound'),
                text: `DELETE FROM ${this.t('retry_inbound_counters')}
                 WHERE session_id = $1 AND expires_at_ms <= $2`,
                values: [this.sessionId, nowMs]
            })
        )
        return outboundCount + inboundCount
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('retry_clear_outbound'),
            text: `DELETE FROM ${this.t('retry_outbound_messages')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
        await this.pool.query({
            name: this.stmtName('retry_clear_inbound'),
            text: `DELETE FROM ${this.t('retry_inbound_counters')} WHERE session_id = $1`,
            values: [this.sessionId]
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
