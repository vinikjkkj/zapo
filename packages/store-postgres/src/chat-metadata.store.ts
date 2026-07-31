import type { WaChatMetadataSnapshot, WaChatMetadataStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { queryFirst } from './helpers'
import type { WaPgStorageOptions } from './types'

const DEFAULT_CHAT_METADATA_TTL_MS = 30 * 60 * 1000

function optionalNumber(value: unknown): number | undefined {
    return value === null || value === undefined ? undefined : Number(value)
}

export class WaChatMetadataPostgresStore extends BasePgStore implements WaChatMetadataStore {
    private readonly ttlMs: number

    public constructor(options: WaPgStorageOptions, ttlMs = DEFAULT_CHAT_METADATA_TTL_MS) {
        super(options, ['chatMetadata'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('chatMetadata ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertChatMetadata(snapshot: WaChatMetadataSnapshot): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('chat_metadata_upsert'),
            text: `INSERT INTO ${this.t('chat_metadata_cache')} (
                session_id, chat_jid, ephemeral_expiration, ephemeral_setting_timestamp,
                updated_at_ms, expires_at_ms
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (session_id, chat_jid) DO UPDATE SET
                ephemeral_expiration = EXCLUDED.ephemeral_expiration,
                ephemeral_setting_timestamp = EXCLUDED.ephemeral_setting_timestamp,
                updated_at_ms = EXCLUDED.updated_at_ms,
                expires_at_ms = EXCLUDED.expires_at_ms`,
            values: [
                this.sessionId,
                snapshot.chatJid,
                snapshot.ephemeralExpiration ?? null,
                snapshot.ephemeralSettingTimestamp ?? null,
                snapshot.updatedAtMs,
                snapshot.updatedAtMs + this.ttlMs
            ]
        })
    }

    public async getChatMetadata(
        chatJid: string,
        nowMs = Date.now()
    ): Promise<WaChatMetadataSnapshot | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('chat_metadata_get'),
                text: `SELECT chat_jid, ephemeral_expiration, ephemeral_setting_timestamp,
                        updated_at_ms, expires_at_ms
                 FROM ${this.t('chat_metadata_cache')}
                 WHERE session_id = $1 AND chat_jid = $2`,
                values: [this.sessionId, chatJid]
            })
        )
        if (!row) return null

        if (Number(row.expires_at_ms) <= nowMs) {
            await this.pool.query({
                name: this.stmtName('chat_metadata_delete_expired'),
                text: `DELETE FROM ${this.t('chat_metadata_cache')}
                 WHERE session_id = $1 AND chat_jid = $2 AND expires_at_ms <= $3`,
                values: [this.sessionId, chatJid, nowMs]
            })
            return null
        }

        return {
            chatJid: String(row.chat_jid),
            ephemeralExpiration: optionalNumber(row.ephemeral_expiration),
            ephemeralSettingTimestamp: optionalNumber(row.ephemeral_setting_timestamp),
            updatedAtMs: Number(row.updated_at_ms)
        }
    }

    public async deleteChatMetadata(chatJid: string): Promise<number> {
        await this.ensureReady()
        const result = await this.pool.query({
            name: this.stmtName('chat_metadata_delete'),
            text: `DELETE FROM ${this.t('chat_metadata_cache')}
                 WHERE session_id = $1 AND chat_jid = $2`,
            values: [this.sessionId, chatJid]
        })
        return result.rowCount ?? 0
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        const result = await this.pool.query({
            name: this.stmtName('chat_metadata_cleanup'),
            text: `DELETE FROM ${this.t('chat_metadata_cache')}
                 WHERE session_id = $1 AND expires_at_ms <= $2`,
            values: [this.sessionId, nowMs]
        })
        return result.rowCount ?? 0
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('chat_metadata_clear'),
            text: `DELETE FROM ${this.t('chat_metadata_cache')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
