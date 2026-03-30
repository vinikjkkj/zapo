import type { WaParticipantsSnapshot, WaParticipantsStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryFirst } from './helpers'
import type { WaPgStorageOptions } from './types'

const DEFAULT_PARTICIPANTS_TTL_MS = 5 * 60 * 1000

export class WaParticipantsPgStore extends BasePgStore implements WaParticipantsStore {
    private readonly ttlMs: number

    public constructor(options: WaPgStorageOptions, ttlMs = DEFAULT_PARTICIPANTS_TTL_MS) {
        super(options, ['participants'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('participants ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertGroupParticipants(snapshot: WaParticipantsSnapshot): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('participants_upsert'),
            text: `INSERT INTO ${this.t('group_participants_cache')} (
                session_id, group_jid, participants_json, updated_at_ms, expires_at_ms
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, group_jid) DO UPDATE SET
                participants_json = EXCLUDED.participants_json,
                updated_at_ms = EXCLUDED.updated_at_ms,
                expires_at_ms = EXCLUDED.expires_at_ms`,
            values: [
                this.sessionId,
                snapshot.groupJid,
                JSON.stringify(snapshot.participants),
                snapshot.updatedAtMs,
                snapshot.updatedAtMs + this.ttlMs
            ]
        })
    }

    public async getGroupParticipants(
        groupJid: string,
        nowMs = Date.now()
    ): Promise<WaParticipantsSnapshot | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('participants_get'),
                text: `SELECT group_jid, participants_json, updated_at_ms, expires_at_ms
                 FROM ${this.t('group_participants_cache')}
                 WHERE session_id = $1 AND group_jid = $2`,
                values: [this.sessionId, groupJid]
            })
        )
        if (!row) return null

        if (Number(row.expires_at_ms) <= nowMs) {
            await this.pool.query({
                name: this.stmtName('participants_delete_expired'),
                text: `DELETE FROM ${this.t('group_participants_cache')}
                 WHERE session_id = $1 AND group_jid = $2 AND expires_at_ms <= $3`,
                values: [this.sessionId, groupJid, nowMs]
            })
            return null
        }

        const parsed: unknown = JSON.parse(row.participants_json as string)
        if (!Array.isArray(parsed)) {
            throw new Error('group_participants_cache.participants_json must be an array')
        }

        return {
            groupJid: String(row.group_jid),
            participants: parsed.map((entry: unknown) => String(entry)),
            updatedAtMs: Number(row.updated_at_ms)
        }
    }

    public async deleteGroupParticipants(groupJid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('participants_delete_group'),
                text: `DELETE FROM ${this.t('group_participants_cache')}
                 WHERE session_id = $1 AND group_jid = $2`,
                values: [this.sessionId, groupJid]
            })
        )
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('participants_cleanup'),
                text: `DELETE FROM ${this.t('group_participants_cache')}
                 WHERE session_id = $1 AND expires_at_ms <= $2`,
                values: [this.sessionId, nowMs]
            })
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('participants_clear'),
            text: `DELETE FROM ${this.t('group_participants_cache')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
