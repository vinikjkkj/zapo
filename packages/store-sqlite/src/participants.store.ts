import type { WaParticipantsSnapshot, WaParticipantsStore } from 'zapo-js/store'
import { asNumber, asString } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteStorageOptions } from './types'

interface ParticipantsRow extends Record<string, unknown> {
    readonly group_jid: unknown
    readonly participants_json: unknown
    readonly updated_at_ms: unknown
    readonly expires_at_ms: unknown
}

const DEFAULT_PARTICIPANTS_TTL_MS = 5 * 60 * 1000

export class WaParticipantsSqliteStore extends BaseSqliteStore implements WaParticipantsStore {
    private readonly ttlMs: number

    public constructor(options: WaSqliteStorageOptions, ttlMs = DEFAULT_PARTICIPANTS_TTL_MS) {
        super(options, ['participants'])
        this.ttlMs = ttlMs
    }

    public async upsertGroupParticipants(snapshot: WaParticipantsSnapshot): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO group_participants_cache (
                session_id,
                group_jid,
                participants_json,
                updated_at_ms,
                expires_at_ms
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, group_jid) DO UPDATE SET
                participants_json=excluded.participants_json,
                updated_at_ms=excluded.updated_at_ms,
                expires_at_ms=excluded.expires_at_ms`,
            [
                this.options.sessionId,
                snapshot.groupJid,
                JSON.stringify(snapshot.participants),
                snapshot.updatedAtMs,
                snapshot.updatedAtMs + this.ttlMs
            ]
        )
    }

    public async getGroupParticipants(
        groupJid: string,
        nowMs = Date.now()
    ): Promise<WaParticipantsSnapshot | null> {
        const db = await this.getConnection()
        const row = db.get<ParticipantsRow>(
            `SELECT group_jid, participants_json, updated_at_ms, expires_at_ms
            FROM group_participants_cache
            WHERE session_id = ? AND group_jid = ?`,
            [this.options.sessionId, groupJid]
        )
        if (!row) {
            return null
        }

        const expiresAtMs = asNumber(row.expires_at_ms, 'group_participants_cache.expires_at_ms')
        if (expiresAtMs <= nowMs) {
            db.run(
                `DELETE FROM group_participants_cache
                 WHERE session_id = ? AND group_jid = ? AND expires_at_ms <= ?`,
                [this.options.sessionId, groupJid, nowMs]
            )
            return null
        }

        return {
            groupJid: asString(row.group_jid, 'group_participants_cache.group_jid'),
            participants: decodeParticipants(row.participants_json),
            updatedAtMs: asNumber(row.updated_at_ms, 'group_participants_cache.updated_at_ms')
        }
    }

    public async deleteGroupParticipants(groupJid: string): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM group_participants_cache
             WHERE session_id = ? AND group_jid = ?`,
            [this.options.sessionId, groupJid]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM group_participants_cache
             WHERE session_id = ? AND expires_at_ms <= ?`,
            [this.options.sessionId, nowMs]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM group_participants_cache WHERE session_id = ?', [
            this.options.sessionId
        ])
    }
}

function decodeParticipants(raw: unknown): readonly string[] {
    const json = asString(raw, 'group_participants_cache.participants_json')
    const parsed: unknown = JSON.parse(json)
    if (!Array.isArray(parsed)) {
        throw new Error('group_participants_cache.participants_json must be an array')
    }
    return parsed.map((entry) =>
        asString(entry, 'group_participants_cache.participants_json entry')
    )
}
