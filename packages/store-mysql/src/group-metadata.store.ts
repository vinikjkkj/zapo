import type { WaGroupMetadataSnapshot, WaGroupMetadataStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryFirst } from './helpers'
import type { WaMysqlStorageOptions } from './types'

const DEFAULT_GROUP_METADATA_TTL_MS = 5 * 60 * 1000

export class WaGroupMetadataMysqlStore extends BaseMysqlStore implements WaGroupMetadataStore {
    private readonly ttlMs: number

    public constructor(options: WaMysqlStorageOptions, ttlMs = DEFAULT_GROUP_METADATA_TTL_MS) {
        super(options, ['participants'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('groupMetadata ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertGroupMetadata(snapshot: WaGroupMetadataSnapshot): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('group_participants_cache')} (
                session_id, group_jid, participants_json, ephemeral, updated_at_ms, expires_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                participants_json = VALUES(participants_json),
                ephemeral = VALUES(ephemeral),
                updated_at_ms = VALUES(updated_at_ms),
                expires_at_ms = VALUES(expires_at_ms)`,
            [
                this.sessionId,
                snapshot.groupJid,
                JSON.stringify(snapshot.participants),
                snapshot.ephemeral ?? null,
                snapshot.updatedAtMs,
                snapshot.updatedAtMs + this.ttlMs
            ]
        )
    }

    public async getGroupMetadata(
        groupJid: string,
        nowMs = Date.now()
    ): Promise<WaGroupMetadataSnapshot | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT group_jid, participants_json, ephemeral, updated_at_ms, expires_at_ms
             FROM ${this.t('group_participants_cache')}
             WHERE session_id = ? AND group_jid = ?`,
                [this.sessionId, groupJid]
            )
        )
        if (!row) return null

        if (Number(row.expires_at_ms) <= nowMs) {
            await this.pool.execute(
                `DELETE FROM ${this.t('group_participants_cache')}
                 WHERE session_id = ? AND group_jid = ? AND expires_at_ms <= ?`,
                [this.sessionId, groupJid, nowMs]
            )
            return null
        }

        const rawJson =
            row.participants_json instanceof Uint8Array
                ? new TextDecoder().decode(row.participants_json)
                : String(row.participants_json)
        const parsed: unknown = JSON.parse(rawJson)
        if (!Array.isArray(parsed)) {
            throw new Error('group_participants_cache.participants_json must be an array')
        }

        const ephemeral = row.ephemeral === null ? undefined : Number(row.ephemeral)
        return {
            groupJid: String(row.group_jid),
            participants: parsed.map((entry: unknown) => String(entry)),
            ephemeral,
            updatedAtMs: Number(row.updated_at_ms)
        }
    }

    public async deleteGroupMetadata(groupJid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('group_participants_cache')}
             WHERE session_id = ? AND group_jid = ?`,
                [this.sessionId, groupJid]
            )
        )
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('group_participants_cache')}
             WHERE session_id = ? AND expires_at_ms <= ?`,
                [this.sessionId, nowMs]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `DELETE FROM ${this.t('group_participants_cache')} WHERE session_id = ?`,
            [this.sessionId]
        )
    }
}
