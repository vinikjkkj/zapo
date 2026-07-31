import type { WaChatMetadataSnapshot, WaChatMetadataStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryFirst } from './helpers'
import type { WaMysqlStorageOptions } from './types'

const DEFAULT_CHAT_METADATA_TTL_MS = 30 * 60 * 1000

function optionalNumber(value: unknown): number | undefined {
    return value === null || value === undefined ? undefined : Number(value)
}

export class WaChatMetadataMysqlStore extends BaseMysqlStore implements WaChatMetadataStore {
    private readonly ttlMs: number

    public constructor(options: WaMysqlStorageOptions, ttlMs = DEFAULT_CHAT_METADATA_TTL_MS) {
        super(options, ['chatMetadata'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('chatMetadata ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertChatMetadata(snapshot: WaChatMetadataSnapshot): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('chat_metadata_cache')} (
                session_id, chat_jid, ephemeral_expiration, ephemeral_setting_timestamp,
                updated_at_ms, expires_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                ephemeral_expiration = VALUES(ephemeral_expiration),
                ephemeral_setting_timestamp = VALUES(ephemeral_setting_timestamp),
                updated_at_ms = VALUES(updated_at_ms),
                expires_at_ms = VALUES(expires_at_ms)`,
            [
                this.sessionId,
                snapshot.chatJid,
                snapshot.ephemeralExpiration ?? null,
                snapshot.ephemeralSettingTimestamp ?? null,
                snapshot.updatedAtMs,
                snapshot.updatedAtMs + this.ttlMs
            ]
        )
    }

    public async getChatMetadata(
        chatJid: string,
        nowMs = Date.now()
    ): Promise<WaChatMetadataSnapshot | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query(
                `SELECT chat_jid, ephemeral_expiration, ephemeral_setting_timestamp,
                        updated_at_ms, expires_at_ms
                 FROM ${this.t('chat_metadata_cache')}
                 WHERE session_id = ? AND chat_jid = ?`,
                [this.sessionId, chatJid]
            )
        )
        if (!row) return null

        if (Number(row.expires_at_ms) <= nowMs) {
            await this.pool.execute(
                `DELETE FROM ${this.t('chat_metadata_cache')}
                 WHERE session_id = ? AND chat_jid = ? AND expires_at_ms <= ?`,
                [this.sessionId, chatJid, nowMs]
            )
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
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('chat_metadata_cache')} WHERE session_id = ? AND chat_jid = ?`,
                [this.sessionId, chatJid]
            )
        )
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('chat_metadata_cache')}
                 WHERE session_id = ? AND expires_at_ms <= ?`,
                [this.sessionId, nowMs]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `DELETE FROM ${this.t('chat_metadata_cache')} WHERE session_id = ?`,
            [this.sessionId]
        )
    }
}
