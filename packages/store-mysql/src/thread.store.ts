import type { WaThreadStore, WaStoredThreadRecord } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryFirst, queryRows, safeLimit, type MysqlRow } from './helpers'
import type { WaMysqlStorageOptions } from './types'

export class WaThreadMysqlStore extends BaseMysqlStore implements WaThreadStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredThreadRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('mailbox_threads')} (
                session_id, jid, name, unread_count, archived, pinned,
                mute_end_ms, marked_as_unread, ephemeral_expiration
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                name = COALESCE(VALUES(name), name),
                unread_count = COALESCE(VALUES(unread_count), unread_count),
                archived = COALESCE(VALUES(archived), archived),
                pinned = COALESCE(VALUES(pinned), pinned),
                mute_end_ms = COALESCE(VALUES(mute_end_ms), mute_end_ms),
                marked_as_unread = COALESCE(VALUES(marked_as_unread), marked_as_unread),
                ephemeral_expiration = COALESCE(VALUES(ephemeral_expiration), ephemeral_expiration)`,
            [
                this.sessionId,
                record.jid,
                record.name ?? null,
                record.unreadCount ?? null,
                record.archived === undefined ? null : record.archived ? 1 : 0,
                record.pinned ?? null,
                record.muteEndMs ?? null,
                record.markedAsUnread === undefined ? null : record.markedAsUnread ? 1 : 0,
                record.ephemeralExpiration ?? null
            ]
        )
    }

    public async upsertBatch(records: readonly WaStoredThreadRecord[]): Promise<void> {
        if (records.length === 0) return

        await this.withTransaction(async (conn) => {
            for (const record of records) {
                await conn.execute(
                    `INSERT INTO ${this.t('mailbox_threads')} (
                        session_id, jid, name, unread_count, archived, pinned,
                        mute_end_ms, marked_as_unread, ephemeral_expiration
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        name = COALESCE(VALUES(name), name),
                        unread_count = COALESCE(VALUES(unread_count), unread_count),
                        archived = COALESCE(VALUES(archived), archived),
                        pinned = COALESCE(VALUES(pinned), pinned),
                        mute_end_ms = COALESCE(VALUES(mute_end_ms), mute_end_ms),
                        marked_as_unread = COALESCE(VALUES(marked_as_unread), marked_as_unread),
                        ephemeral_expiration = COALESCE(VALUES(ephemeral_expiration), ephemeral_expiration)`,
                    [
                        this.sessionId,
                        record.jid,
                        record.name ?? null,
                        record.unreadCount ?? null,
                        record.archived === undefined ? null : record.archived ? 1 : 0,
                        record.pinned ?? null,
                        record.muteEndMs ?? null,
                        record.markedAsUnread === undefined ? null : record.markedAsUnread ? 1 : 0,
                        record.ephemeralExpiration ?? null
                    ]
                )
            }
        })
    }

    public async getByJid(jid: string): Promise<WaStoredThreadRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT jid, name, unread_count, archived, pinned,
                    mute_end_ms, marked_as_unread, ephemeral_expiration
             FROM ${this.t('mailbox_threads')}
             WHERE session_id = ? AND jid = ?`,
                [this.sessionId, jid]
            )
        )
        if (!row) return null
        return rowToRecord(row)
    }

    public async list(limit?: number): Promise<readonly WaStoredThreadRecord[]> {
        await this.ensureReady()
        const resolved = safeLimit(limit, 100)
        return queryRows(
            await this.pool.execute(
                `SELECT jid, name, unread_count, archived, pinned,
                    mute_end_ms, marked_as_unread, ephemeral_expiration
             FROM ${this.t('mailbox_threads')}
             WHERE session_id = ?
             LIMIT ${resolved}`,
                [this.sessionId]
            )
        ).map(rowToRecord)
    }

    public async deleteByJid(jid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('mailbox_threads')}
             WHERE session_id = ? AND jid = ?`,
                [this.sessionId, jid]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(`DELETE FROM ${this.t('mailbox_threads')} WHERE session_id = ?`, [
            this.sessionId
        ])
    }
}

function rowToRecord(row: MysqlRow): WaStoredThreadRecord {
    return {
        jid: row.jid as string,
        name: (row.name as string | null) ?? undefined,
        unreadCount: row.unread_count !== null ? Number(row.unread_count) : undefined,
        archived: row.archived === null ? undefined : Number(row.archived) === 1,
        pinned: row.pinned !== null ? Number(row.pinned) : undefined,
        muteEndMs: row.mute_end_ms !== null ? Number(row.mute_end_ms) : undefined,
        markedAsUnread:
            row.marked_as_unread === null ? undefined : Number(row.marked_as_unread) === 1,
        ephemeralExpiration:
            row.ephemeral_expiration !== null ? Number(row.ephemeral_expiration) : undefined
    }
}
