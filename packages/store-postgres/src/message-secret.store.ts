import type { WaMessageSecretStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryFirst, queryRows, toBytes } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const DEFAULT_MESSAGE_SECRET_TTL_MS = 30 * 60 * 1000
const BATCH_SIZE = 500

export class WaMessageSecretPgStore extends BasePgStore implements WaMessageSecretStore {
    private readonly ttlMs: number

    public constructor(options: WaPgStorageOptions, ttlMs = DEFAULT_MESSAGE_SECRET_TTL_MS) {
        super(options, ['messageSecret'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('message-secret ttlMs must be a positive finite number')
        }
        this.ttlMs = ttlMs
    }

    public async get(messageId: string, nowMs = Date.now()): Promise<Uint8Array | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('msgsecret_get'),
                text: `SELECT secret, expires_at_ms
                 FROM ${this.t('message_secrets_cache')}
                 WHERE session_id = $1 AND message_id = $2`,
                values: [this.sessionId, messageId]
            })
        )
        if (!row) return null

        if (Number(row.expires_at_ms) <= nowMs) {
            await this.pool.query({
                name: this.stmtName('msgsecret_delete_expired_one'),
                text: `DELETE FROM ${this.t('message_secrets_cache')}
                 WHERE session_id = $1 AND message_id = $2 AND expires_at_ms <= $3`,
                values: [this.sessionId, messageId, nowMs]
            })
            return null
        }

        return toBytes(row.secret)
    }

    public async getBatch(
        messageIds: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (Uint8Array | null)[]> {
        if (messageIds.length === 0) return []
        await this.ensureReady()

        const uniqueIds = [...new Set(messageIds)]
        const activeById = new Map<string, Uint8Array>()
        const expiredIds: string[] = []

        for (let start = 0; start < uniqueIds.length; start += BATCH_SIZE) {
            const batch = uniqueIds.slice(start, start + BATCH_SIZE)
            let paramIdx = 2
            const placeholders = batch.map(() => `$${paramIdx++}`).join(', ')
            const params: PgParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT message_id, secret, expires_at_ms
                     FROM ${this.t('message_secrets_cache')}
                     WHERE session_id = $1 AND message_id IN (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                const id = String(row.message_id)
                const expiresAtMs = Number(row.expires_at_ms)
                if (expiresAtMs <= nowMs) {
                    expiredIds.push(id)
                    continue
                }
                activeById.set(id, toBytes(row.secret))
            }
        }

        if (expiredIds.length > 0) {
            for (let start = 0; start < expiredIds.length; start += BATCH_SIZE) {
                const batch = expiredIds.slice(start, start + BATCH_SIZE)
                let paramIdx = 3
                const placeholders = batch.map(() => `$${paramIdx++}`).join(', ')
                const params: PgParam[] = [this.sessionId, nowMs, ...batch]
                await this.pool.query(
                    `DELETE FROM ${this.t('message_secrets_cache')}
                     WHERE session_id = $1 AND expires_at_ms <= $2 AND message_id IN (${placeholders})`,
                    params
                )
            }
        }

        return messageIds.map((id) => activeById.get(id) ?? null)
    }

    public async set(messageId: string, secret: Uint8Array): Promise<void> {
        await this.ensureReady()
        const nowMs = Date.now()
        await this.pool.query({
            name: this.stmtName('msgsecret_set'),
            text: `INSERT INTO ${this.t('message_secrets_cache')} (
                session_id, message_id, secret, expires_at_ms
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (session_id, message_id) DO UPDATE SET
                secret = EXCLUDED.secret,
                expires_at_ms = EXCLUDED.expires_at_ms`,
            values: [this.sessionId, messageId, secret, nowMs + this.ttlMs]
        })
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly secret: Uint8Array }[]
    ): Promise<void> {
        if (entries.length === 0) return
        await this.withTransaction(async (client) => {
            const nowMs = Date.now()
            for (const entry of entries) {
                await client.query(
                    `INSERT INTO ${this.t('message_secrets_cache')} (
                        session_id, message_id, secret, expires_at_ms
                    ) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (session_id, message_id) DO UPDATE SET
                        secret = EXCLUDED.secret,
                        expires_at_ms = EXCLUDED.expires_at_ms`,
                    [this.sessionId, entry.messageId, entry.secret, nowMs + this.ttlMs]
                )
            }
        })
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('msgsecret_cleanup'),
                text: `DELETE FROM ${this.t('message_secrets_cache')}
                 WHERE session_id = $1 AND expires_at_ms <= $2`,
                values: [this.sessionId, nowMs]
            })
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('msgsecret_clear'),
            text: `DELETE FROM ${this.t('message_secrets_cache')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
