import type {
    WaMessageStore as Contract,
    WaStoredMessageRecord
} from '@store/contracts/message.store'
import { BaseSqliteStore } from '@store/providers/sqlite/BaseSqliteStore'
import type { WaSqliteStorageOptions } from '@store/types'
import { asOptionalBytes, asOptionalNumber, asOptionalString, asString } from '@util/coercion'
import { normalizeQueryLimit } from '@util/collections'

interface MessageRow extends Record<string, unknown> {
    readonly message_id: unknown
    readonly thread_jid: unknown
    readonly sender_jid: unknown
    readonly participant_jid: unknown
    readonly from_me: unknown
    readonly timestamp_ms: unknown
    readonly enc_type: unknown
    readonly plaintext: unknown
    readonly message_bytes: unknown
}

function decodeMessageRow(row: MessageRow): WaStoredMessageRecord {
    return {
        id: asString(row.message_id, 'mailbox_messages.message_id'),
        threadJid: asString(row.thread_jid, 'mailbox_messages.thread_jid'),
        senderJid: asOptionalString(row.sender_jid, 'mailbox_messages.sender_jid'),
        participantJid: asOptionalString(row.participant_jid, 'mailbox_messages.participant_jid'),
        fromMe: Number(row.from_me) === 1,
        timestampMs: asOptionalNumber(row.timestamp_ms, 'mailbox_messages.timestamp_ms'),
        encType: asOptionalString(row.enc_type, 'mailbox_messages.enc_type'),
        plaintext: asOptionalBytes(row.plaintext, 'mailbox_messages.plaintext'),
        messageBytes: asOptionalBytes(row.message_bytes, 'mailbox_messages.message_bytes')
    }
}

export class WaMessageSqliteStore extends BaseSqliteStore implements Contract {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredMessageRecord): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO mailbox_messages (
                session_id,
                message_id,
                thread_jid,
                sender_jid,
                participant_jid,
                from_me,
                timestamp_ms,
                enc_type,
                plaintext,
                message_bytes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, message_id) DO UPDATE SET
                thread_jid=excluded.thread_jid,
                sender_jid=excluded.sender_jid,
                participant_jid=excluded.participant_jid,
                from_me=excluded.from_me,
                timestamp_ms=excluded.timestamp_ms,
                enc_type=excluded.enc_type,
                plaintext=excluded.plaintext,
                message_bytes=excluded.message_bytes`,
            [
                this.options.sessionId,
                record.id,
                record.threadJid,
                record.senderJid ?? null,
                record.participantJid ?? null,
                record.fromMe ? 1 : 0,
                record.timestampMs ?? null,
                record.encType ?? null,
                record.plaintext ?? null,
                record.messageBytes ?? null
            ]
        )
    }

    public async getById(id: string): Promise<WaStoredMessageRecord | null> {
        const db = await this.getConnection()
        const row = db.get<MessageRow>(
            `SELECT
                message_id,
                thread_jid,
                sender_jid,
                participant_jid,
                from_me,
                timestamp_ms,
                enc_type,
                plaintext,
                message_bytes
             FROM mailbox_messages
             WHERE session_id = ? AND message_id = ?`,
            [this.options.sessionId, id]
        )
        return row ? decodeMessageRow(row) : null
    }

    public async listByThread(
        threadJid: string,
        limit?: number,
        beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]> {
        const db = await this.getConnection()
        const normalizedLimit = normalizeQueryLimit(limit, 50)
        const rows =
            beforeTimestampMs === undefined
                ? db.all<MessageRow>(
                      `SELECT
                          message_id,
                          thread_jid,
                          sender_jid,
                          participant_jid,
                          from_me,
                          timestamp_ms,
                          enc_type,
                          plaintext,
                          message_bytes
                       FROM mailbox_messages
                       WHERE session_id = ? AND thread_jid = ?
                       ORDER BY timestamp_ms DESC, message_id DESC
                       LIMIT ?`,
                      [this.options.sessionId, threadJid, normalizedLimit]
                  )
                : db.all<MessageRow>(
                      `SELECT
                          message_id,
                          thread_jid,
                          sender_jid,
                          participant_jid,
                          from_me,
                          timestamp_ms,
                          enc_type,
                          plaintext,
                          message_bytes
                       FROM mailbox_messages
                       WHERE session_id = ?
                         AND thread_jid = ?
                         AND timestamp_ms < ?
                       ORDER BY timestamp_ms DESC, message_id DESC
                       LIMIT ?`,
                      [this.options.sessionId, threadJid, beforeTimestampMs, normalizedLimit]
                  )

        return rows.map(decodeMessageRow)
    }

    public async deleteById(id: string): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM mailbox_messages
             WHERE session_id = ? AND message_id = ?`,
            [this.options.sessionId, id]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM mailbox_messages WHERE session_id = ?', [this.options.sessionId])
    }
}
