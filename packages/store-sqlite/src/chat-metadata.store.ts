import type { WaChatMetadataSnapshot, WaChatMetadataStore } from 'zapo-js/store'
import { asNumber, asString } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteStorageOptions } from './types'

interface ChatMetadataRow extends Record<string, unknown> {
    readonly chat_jid: unknown
    readonly ephemeral_expiration: unknown
    readonly ephemeral_setting_timestamp: unknown
    readonly updated_at_ms: unknown
    readonly expires_at_ms: unknown
}

const DEFAULT_CHAT_METADATA_TTL_MS = 30 * 60 * 1000

function optionalNumber(value: unknown, field: string): number | undefined {
    return value === null || value === undefined ? undefined : asNumber(value, field)
}

export class WaChatMetadataSqliteStore extends BaseSqliteStore implements WaChatMetadataStore {
    private readonly ttlMs: number

    public constructor(options: WaSqliteStorageOptions, ttlMs = DEFAULT_CHAT_METADATA_TTL_MS) {
        super(options, ['chatMetadata'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('chatMetadata ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async upsertChatMetadata(snapshot: WaChatMetadataSnapshot): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO chat_metadata_cache (
                session_id,
                chat_jid,
                ephemeral_expiration,
                ephemeral_setting_timestamp,
                updated_at_ms,
                expires_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, chat_jid) DO UPDATE SET
                ephemeral_expiration=excluded.ephemeral_expiration,
                ephemeral_setting_timestamp=excluded.ephemeral_setting_timestamp,
                updated_at_ms=excluded.updated_at_ms,
                expires_at_ms=excluded.expires_at_ms`,
            [
                this.options.sessionId,
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
        const db = await this.getConnection()
        const row = db.get<ChatMetadataRow>(
            `SELECT chat_jid, ephemeral_expiration, ephemeral_setting_timestamp,
                    updated_at_ms, expires_at_ms
            FROM chat_metadata_cache
            WHERE session_id = ? AND chat_jid = ?`,
            [this.options.sessionId, chatJid]
        )
        if (!row) {
            return null
        }

        const expiresAtMs = asNumber(row.expires_at_ms, 'chat_metadata_cache.expires_at_ms')
        if (expiresAtMs <= nowMs) {
            db.run(
                `DELETE FROM chat_metadata_cache
                 WHERE session_id = ? AND chat_jid = ? AND expires_at_ms <= ?`,
                [this.options.sessionId, chatJid, nowMs]
            )
            return null
        }

        return {
            chatJid: asString(row.chat_jid, 'chat_metadata_cache.chat_jid'),
            ephemeralExpiration: optionalNumber(
                row.ephemeral_expiration,
                'chat_metadata_cache.ephemeral_expiration'
            ),
            ephemeralSettingTimestamp: optionalNumber(
                row.ephemeral_setting_timestamp,
                'chat_metadata_cache.ephemeral_setting_timestamp'
            ),
            updatedAtMs: asNumber(row.updated_at_ms, 'chat_metadata_cache.updated_at_ms')
        }
    }

    public async deleteChatMetadata(chatJid: string): Promise<number> {
        const db = await this.getConnection()
        db.run(`DELETE FROM chat_metadata_cache WHERE session_id = ? AND chat_jid = ?`, [
            this.options.sessionId,
            chatJid
        ])
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        const db = await this.getConnection()
        db.run(`DELETE FROM chat_metadata_cache WHERE session_id = ? AND expires_at_ms <= ?`, [
            this.options.sessionId,
            nowMs
        ])
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run(`DELETE FROM chat_metadata_cache WHERE session_id = ?`, [this.options.sessionId])
    }
}
