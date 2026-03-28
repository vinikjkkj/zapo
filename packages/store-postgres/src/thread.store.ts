import type { WaThreadStore, WaStoredThreadRecord } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryFirst, queryRows, safeLimit, type PgRow } from './helpers'
import type { WaPgStorageOptions } from './types'

function rowToRecord(row: PgRow): WaStoredThreadRecord {
    return {
        jid: row.jid as string,
        name: (row.name as string | null) ?? undefined,
        unreadCount: row.unread_count !== null ? Number(row.unread_count) : undefined,
        archived: row.archived === null ? undefined : Boolean(row.archived),
        pinned: row.pinned !== null ? Number(row.pinned) : undefined,
        muteEndMs: row.mute_end_ms !== null ? Number(row.mute_end_ms) : undefined,
        markedAsUnread: row.marked_as_unread === null ? undefined : Boolean(row.marked_as_unread),
        ephemeralExpiration:
            row.ephemeral_expiration !== null ? Number(row.ephemeral_expiration) : undefined
    }
}

export class WaThreadPgStore extends BasePgStore implements WaThreadStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredThreadRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('thread_upsert'),
            text: `INSERT INTO ${this.t('mailbox_threads')} (
                session_id, jid, name, unread_count, archived, pinned,
                mute_end_ms, marked_as_unread, ephemeral_expiration
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            ON CONFLICT (session_id, jid) DO UPDATE SET
                name = COALESCE(EXCLUDED.name, ${this.t('mailbox_threads')}.name),
                unread_count = COALESCE(EXCLUDED.unread_count, ${this.t('mailbox_threads')}.unread_count),
                archived = COALESCE(EXCLUDED.archived, ${this.t('mailbox_threads')}.archived),
                pinned = COALESCE(EXCLUDED.pinned, ${this.t('mailbox_threads')}.pinned),
                mute_end_ms = COALESCE(EXCLUDED.mute_end_ms, ${this.t('mailbox_threads')}.mute_end_ms),
                marked_as_unread = COALESCE(EXCLUDED.marked_as_unread, ${this.t('mailbox_threads')}.marked_as_unread),
                ephemeral_expiration = COALESCE(EXCLUDED.ephemeral_expiration, ${this.t('mailbox_threads')}.ephemeral_expiration)`,
            values: [
                this.sessionId,
                record.jid,
                record.name ?? null,
                record.unreadCount ?? null,
                record.archived ?? null,
                record.pinned ?? null,
                record.muteEndMs ?? null,
                record.markedAsUnread ?? null,
                record.ephemeralExpiration ?? null
            ]
        })
    }

    public async upsertBatch(records: readonly WaStoredThreadRecord[]): Promise<void> {
        if (records.length === 0) return

        await this.withTransaction(async (client) => {
            for (const record of records) {
                await client.query({
                    name: this.stmtName('thread_upsert'),
                    text: `INSERT INTO ${this.t('mailbox_threads')} (
                        session_id, jid, name, unread_count, archived, pinned,
                        mute_end_ms, marked_as_unread, ephemeral_expiration
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    ON CONFLICT (session_id, jid) DO UPDATE SET
                        name = COALESCE(EXCLUDED.name, ${this.t('mailbox_threads')}.name),
                        unread_count = COALESCE(EXCLUDED.unread_count, ${this.t('mailbox_threads')}.unread_count),
                        archived = COALESCE(EXCLUDED.archived, ${this.t('mailbox_threads')}.archived),
                        pinned = COALESCE(EXCLUDED.pinned, ${this.t('mailbox_threads')}.pinned),
                        mute_end_ms = COALESCE(EXCLUDED.mute_end_ms, ${this.t('mailbox_threads')}.mute_end_ms),
                        marked_as_unread = COALESCE(EXCLUDED.marked_as_unread, ${this.t('mailbox_threads')}.marked_as_unread),
                        ephemeral_expiration = COALESCE(EXCLUDED.ephemeral_expiration, ${this.t('mailbox_threads')}.ephemeral_expiration)`,
                    values: [
                        this.sessionId,
                        record.jid,
                        record.name ?? null,
                        record.unreadCount ?? null,
                        record.archived ?? null,
                        record.pinned ?? null,
                        record.muteEndMs ?? null,
                        record.markedAsUnread ?? null,
                        record.ephemeralExpiration ?? null
                    ]
                })
            }
        })
    }

    public async getByJid(jid: string): Promise<WaStoredThreadRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('thread_get_by_jid'),
                text: `SELECT jid, name, unread_count, archived, pinned,
                    mute_end_ms, marked_as_unread, ephemeral_expiration
             FROM ${this.t('mailbox_threads')}
             WHERE session_id = $1 AND jid = $2`,
                values: [this.sessionId, jid]
            })
        )
        if (!row) return null
        return rowToRecord(row)
    }

    public async list(limit?: number): Promise<readonly WaStoredThreadRecord[]> {
        await this.ensureReady()
        const resolved = safeLimit(limit, 100)
        return queryRows(
            await this.pool.query({
                name: this.stmtName('thread_list'),
                text: `SELECT jid, name, unread_count, archived, pinned,
                    mute_end_ms, marked_as_unread, ephemeral_expiration
             FROM ${this.t('mailbox_threads')}
             WHERE session_id = $1
             LIMIT $2`,
                values: [this.sessionId, resolved]
            })
        ).map(rowToRecord)
    }

    public async deleteByJid(jid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('thread_delete_by_jid'),
                text: `DELETE FROM ${this.t('mailbox_threads')}
             WHERE session_id = $1 AND jid = $2`,
                values: [this.sessionId, jid]
            })
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('thread_clear'),
            text: `DELETE FROM ${this.t('mailbox_threads')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
