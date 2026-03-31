import type { WaMessageSecretEntry, WaMessageSecretStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryRows, toBytes } from './helpers'
import type { WaMysqlStorageOptions } from './types'

const DEFAULT_MESSAGE_SECRET_TTL_MS = 30 * 60 * 1000
const BATCH_SIZE = 500
const FIXED_IN_PLACEHOLDERS = Array.from({ length: BATCH_SIZE }, () => '?').join(', ')

export class WaMessageSecretMysqlStore extends BaseMysqlStore implements WaMessageSecretStore {
    private readonly ttlMs: number

    public constructor(options: WaMysqlStorageOptions, ttlMs = DEFAULT_MESSAGE_SECRET_TTL_MS) {
        super(options, ['messageSecret'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('message-secret ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async get(messageId: string, nowMs = Date.now()): Promise<WaMessageSecretEntry | null> {
        await this.ensureReady()
        const rows = queryRows(
            await this.pool.execute(
                `SELECT secret, sender_jid, expires_at_ms
                 FROM ${this.t('message_secrets_cache')}
                 WHERE session_id = ? AND message_id = ?`,
                [this.sessionId, messageId]
            )
        )
        if (rows.length === 0) return null

        const row = rows[0]
        if (Number(row.expires_at_ms) <= nowMs) {
            await this.pool.execute(
                `DELETE FROM ${this.t('message_secrets_cache')}
                 WHERE session_id = ? AND message_id = ? AND expires_at_ms <= ?`,
                [this.sessionId, messageId, nowMs]
            )
            return null
        }

        return { secret: toBytes(row.secret), senderJid: String(row.sender_jid) }
    }

    public async getBatch(
        messageIds: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (WaMessageSecretEntry | null)[]> {
        if (messageIds.length === 0) return []
        await this.ensureReady()

        const uniqueIds = [...new Set(messageIds)]
        const activeById = new Map<string, WaMessageSecretEntry>()
        const expiredIds: string[] = []

        for (let start = 0; start < uniqueIds.length; start += BATCH_SIZE) {
            const batch = uniqueIds.slice(start, start + BATCH_SIZE)
            while (batch.length < BATCH_SIZE) batch.push('')
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT message_id, secret, sender_jid, expires_at_ms
                     FROM ${this.t('message_secrets_cache')}
                     WHERE session_id = ? AND message_id IN (${FIXED_IN_PLACEHOLDERS})`,
                    [this.sessionId, ...batch]
                )
            )
            for (const row of rows) {
                const id = String(row.message_id)
                const expiresAtMs = Number(row.expires_at_ms)
                if (expiresAtMs <= nowMs) {
                    expiredIds.push(id)
                    continue
                }
                activeById.set(id, {
                    secret: toBytes(row.secret),
                    senderJid: String(row.sender_jid)
                })
            }
        }

        if (expiredIds.length > 0) {
            for (let start = 0; start < expiredIds.length; start += BATCH_SIZE) {
                const batch = expiredIds.slice(start, start + BATCH_SIZE)
                while (batch.length < BATCH_SIZE) batch.push('')
                await this.pool.execute(
                    `DELETE FROM ${this.t('message_secrets_cache')}
                     WHERE session_id = ? AND expires_at_ms <= ? AND message_id IN (${FIXED_IN_PLACEHOLDERS})`,
                    [this.sessionId, nowMs, ...batch]
                )
            }
        }

        return messageIds.map((id) => activeById.get(id) ?? null)
    }

    public async set(messageId: string, entry: WaMessageSecretEntry): Promise<void> {
        await this.ensureReady()
        const nowMs = Date.now()
        await this.pool.execute(
            `INSERT INTO ${this.t('message_secrets_cache')} (
                session_id, message_id, secret, sender_jid, expires_at_ms
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                secret = VALUES(secret),
                sender_jid = VALUES(sender_jid),
                expires_at_ms = VALUES(expires_at_ms)`,
            [this.sessionId, messageId, entry.secret, entry.senderJid, nowMs + this.ttlMs]
        )
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly entry: WaMessageSecretEntry }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const nowMs = Date.now()
        await this.withTransaction(async (conn) => {
            for (const e of entries) {
                await conn.execute(
                    `INSERT INTO ${this.t('message_secrets_cache')} (
                        session_id, message_id, secret, sender_jid, expires_at_ms
                    ) VALUES (?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        secret = VALUES(secret),
                        sender_jid = VALUES(sender_jid),
                        expires_at_ms = VALUES(expires_at_ms)`,
                    [
                        this.sessionId,
                        e.messageId,
                        e.entry.secret,
                        e.entry.senderJid,
                        nowMs + this.ttlMs
                    ]
                )
            }
        })
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('message_secrets_cache')}
             WHERE session_id = ? AND expires_at_ms <= ?`,
                [this.sessionId, nowMs]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `DELETE FROM ${this.t('message_secrets_cache')} WHERE session_id = ?`,
            [this.sessionId]
        )
    }
}
