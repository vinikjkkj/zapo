import type { WaStoredThreadRecord, WaThreadStore as Contract } from '@store/contracts/thread.store'
import { BaseSqliteStore } from '@store/providers/sqlite/BaseSqliteStore'
import type { WaSqliteStorageOptions } from '@store/types'
import { asOptionalNumber, asOptionalString, asString, toBoolOrUndef } from '@util/coercion'
import { normalizeQueryLimit } from '@util/collections'

const THREAD_COLUMNS =
    'jid, name, unread_count, archived, pinned, mute_end_ms, marked_as_unread, ephemeral_expiration'

interface ThreadRow extends Record<string, unknown> {
    readonly jid: unknown
    readonly name: unknown
    readonly unread_count: unknown
    readonly archived: unknown
    readonly pinned: unknown
    readonly mute_end_ms: unknown
    readonly marked_as_unread: unknown
    readonly ephemeral_expiration: unknown
}

function decodeThreadRow(row: ThreadRow): WaStoredThreadRecord {
    return {
        jid: asString(row.jid, 'mailbox_threads.jid'),
        name: asOptionalString(row.name, 'mailbox_threads.name'),
        unreadCount: asOptionalNumber(row.unread_count, 'mailbox_threads.unread_count'),
        archived: toBoolOrUndef(row.archived),
        pinned: asOptionalNumber(row.pinned, 'mailbox_threads.pinned'),
        muteEndMs: asOptionalNumber(row.mute_end_ms, 'mailbox_threads.mute_end_ms'),
        markedAsUnread: toBoolOrUndef(row.marked_as_unread),
        ephemeralExpiration: asOptionalNumber(
            row.ephemeral_expiration,
            'mailbox_threads.ephemeral_expiration'
        )
    }
}

export class WaThreadSqliteStore extends BaseSqliteStore implements Contract {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredThreadRecord): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO mailbox_threads (
                session_id, jid, name, unread_count, archived, pinned,
                mute_end_ms, marked_as_unread, ephemeral_expiration
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, jid) DO UPDATE SET
                name=COALESCE(excluded.name, mailbox_threads.name),
                unread_count=COALESCE(excluded.unread_count, mailbox_threads.unread_count),
                archived=COALESCE(excluded.archived, mailbox_threads.archived),
                pinned=COALESCE(excluded.pinned, mailbox_threads.pinned),
                mute_end_ms=COALESCE(excluded.mute_end_ms, mailbox_threads.mute_end_ms),
                marked_as_unread=COALESCE(excluded.marked_as_unread, mailbox_threads.marked_as_unread),
                ephemeral_expiration=COALESCE(excluded.ephemeral_expiration, mailbox_threads.ephemeral_expiration)`,
            [
                this.options.sessionId,
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

    public async getByJid(jid: string): Promise<WaStoredThreadRecord | null> {
        const db = await this.getConnection()
        const row = db.get<ThreadRow>(
            `SELECT ${THREAD_COLUMNS}
             FROM mailbox_threads
             WHERE session_id = ? AND jid = ?`,
            [this.options.sessionId, jid]
        )
        return row ? decodeThreadRow(row) : null
    }

    public async list(limit?: number): Promise<readonly WaStoredThreadRecord[]> {
        const db = await this.getConnection()
        const rows = db.all<ThreadRow>(
            `SELECT ${THREAD_COLUMNS}
             FROM mailbox_threads
             WHERE session_id = ?
             LIMIT ?`,
            [this.options.sessionId, normalizeQueryLimit(limit, 100)]
        )
        return rows.map(decodeThreadRow)
    }

    public async deleteByJid(jid: string): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM mailbox_threads
             WHERE session_id = ? AND jid = ?`,
            [this.options.sessionId, jid]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM mailbox_threads WHERE session_id = ?', [this.options.sessionId])
    }
}
