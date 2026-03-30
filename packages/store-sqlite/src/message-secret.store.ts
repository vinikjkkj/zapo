import type { WaMessageSecretStore } from 'zapo-js/store'
import { asBytes, asNumber, asString } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteConnection } from './connection'
import { repeatSqlToken } from './sql-utils'
import type { WaSqliteStorageOptions } from './types'

interface MessageSecretRow extends Record<string, unknown> {
    readonly message_id: unknown
    readonly secret: unknown
    readonly expires_at_ms: unknown
}

const DEFAULTS = Object.freeze({
    ttlMs: 30 * 60 * 1000,
    batchSize: 500
} as const)

export class WaMessageSecretSqliteStore extends BaseSqliteStore implements WaMessageSecretStore {
    private readonly ttlMs: number
    private readonly batchSize: number

    public constructor(
        options: WaSqliteStorageOptions,
        ttlMs = DEFAULTS.ttlMs,
        batchSize = DEFAULTS.batchSize
    ) {
        super(options, ['messageSecret'])
        if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
            throw new Error('message-secret ttlMs must be a positive finite number')
        }
        if (!Number.isFinite(batchSize) || batchSize < 1) {
            throw new Error('message-secret batchSize must be a positive finite number')
        }
        this.ttlMs = ttlMs
        this.batchSize = batchSize
    }

    public async get(messageId: string, nowMs = Date.now()): Promise<Uint8Array | null> {
        const db = await this.getConnection()
        const row = db.get<MessageSecretRow>(
            `SELECT message_id, secret, expires_at_ms
             FROM message_secrets_cache
             WHERE session_id = ? AND message_id = ?`,
            [this.options.sessionId, messageId]
        )
        if (!row) {
            return null
        }
        const expiresAtMs = asNumber(row.expires_at_ms, 'message_secrets_cache.expires_at_ms')
        if (expiresAtMs <= nowMs) {
            db.run(
                `DELETE FROM message_secrets_cache
                 WHERE session_id = ? AND message_id = ? AND expires_at_ms <= ?`,
                [this.options.sessionId, messageId, nowMs]
            )
            return null
        }
        return asBytes(row.secret, 'message_secrets_cache.secret')
    }

    public async getBatch(
        messageIds: readonly string[],
        nowMs = Date.now()
    ): Promise<readonly (Uint8Array | null)[]> {
        if (messageIds.length === 0) {
            return []
        }
        const uniqueMessageIds = [...new Set(messageIds)]
        return this.withTransaction((db) => {
            const activeByMessageId = new Map<string, Uint8Array>()
            const expiredMessageIds: string[] = []
            for (let start = 0; start < uniqueMessageIds.length; start += this.batchSize) {
                const end = Math.min(start + this.batchSize, uniqueMessageIds.length)
                const batchLength = end - start
                const placeholders = repeatSqlToken('?', batchLength, ', ')
                const params: unknown[] = [this.options.sessionId]
                for (let index = start; index < end; index += 1) {
                    params.push(uniqueMessageIds[index])
                }
                const rows = db.all<MessageSecretRow>(
                    `SELECT message_id, secret, expires_at_ms
                     FROM message_secrets_cache
                     WHERE session_id = ? AND message_id IN (${placeholders})`,
                    params
                )
                for (const row of rows) {
                    const messageId = asString(row.message_id, 'message_secrets_cache.message_id')
                    const expiresAtMs = asNumber(
                        row.expires_at_ms,
                        'message_secrets_cache.expires_at_ms'
                    )
                    if (expiresAtMs <= nowMs) {
                        expiredMessageIds.push(messageId)
                        continue
                    }
                    activeByMessageId.set(
                        messageId,
                        asBytes(row.secret, 'message_secrets_cache.secret')
                    )
                }
            }
            if (expiredMessageIds.length > 0) {
                this.deleteMessageSecretsByIds(db, expiredMessageIds)
            }
            const results = new Array<Uint8Array | null>(messageIds.length)
            for (let index = 0; index < messageIds.length; index += 1) {
                results[index] = activeByMessageId.get(messageIds[index]) ?? null
            }
            return results
        })
    }

    public async set(messageId: string, secret: Uint8Array): Promise<void> {
        const db = await this.getConnection()
        this.upsertRow(db, messageId, secret)
    }

    public async setBatch(
        entries: readonly { readonly messageId: string; readonly secret: Uint8Array }[]
    ): Promise<void> {
        if (entries.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (const entry of entries) {
                this.upsertRow(db, entry.messageId, entry.secret)
            }
        })
    }

    public async cleanupExpired(nowMs: number): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM message_secrets_cache
             WHERE session_id = ? AND expires_at_ms <= ?`,
            [this.options.sessionId, nowMs]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM message_secrets_cache WHERE session_id = ?', [this.options.sessionId])
    }

    private upsertRow(db: WaSqliteConnection, messageId: string, secret: Uint8Array): void {
        const nowMs = Date.now()
        db.run(
            `INSERT INTO message_secrets_cache (
                session_id,
                message_id,
                secret,
                expires_at_ms
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id, message_id) DO UPDATE SET
                secret=excluded.secret,
                expires_at_ms=excluded.expires_at_ms`,
            [this.options.sessionId, messageId, secret, nowMs + this.ttlMs]
        )
    }

    private deleteMessageSecretsByIds(db: WaSqliteConnection, messageIds: readonly string[]): void {
        if (messageIds.length === 0) {
            return
        }
        for (let start = 0; start < messageIds.length; start += this.batchSize) {
            const end = Math.min(start + this.batchSize, messageIds.length)
            const batchLength = end - start
            const placeholders = repeatSqlToken('?', batchLength, ', ')
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                params.push(messageIds[index])
            }
            db.run(
                `DELETE FROM message_secrets_cache
                 WHERE session_id = ? AND message_id IN (${placeholders})`,
                params
            )
        }
    }
}
