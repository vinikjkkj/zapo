import type { WaMessageStore, WaStoredMessageRecord } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import {
    affectedRows,
    queryFirst,
    queryRows,
    safeLimit,
    toBytesOrNull,
    type PgRow
} from './helpers'
import type { WaPgStorageOptions } from './types'

function rowToRecord(row: PgRow): WaStoredMessageRecord {
    return {
        id: row.message_id as string,
        threadJid: row.thread_jid as string,
        senderJid: (row.sender_jid as string | null) ?? undefined,
        participantJid: (row.participant_jid as string | null) ?? undefined,
        fromMe: Boolean(row.from_me),
        timestampMs: row.timestamp_ms !== null ? Number(row.timestamp_ms) : undefined,
        encType: (row.enc_type as string | null) ?? undefined,
        plaintext: toBytesOrNull(row.plaintext) ?? undefined,
        messageBytes: toBytesOrNull(row.message_bytes) ?? undefined
    }
}

export class WaMessagePgStore extends BasePgStore implements WaMessageStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredMessageRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('msg_upsert'),
            text: `INSERT INTO ${this.t('mailbox_messages')} (
                session_id, message_id, thread_jid, sender_jid, participant_jid,
                from_me, timestamp_ms, enc_type, plaintext, message_bytes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            ON CONFLICT (session_id, message_id) DO UPDATE SET
                thread_jid = EXCLUDED.thread_jid,
                sender_jid = EXCLUDED.sender_jid,
                participant_jid = EXCLUDED.participant_jid,
                from_me = EXCLUDED.from_me,
                timestamp_ms = EXCLUDED.timestamp_ms,
                enc_type = EXCLUDED.enc_type,
                plaintext = EXCLUDED.plaintext,
                message_bytes = EXCLUDED.message_bytes`,
            values: [
                this.sessionId,
                record.id,
                record.threadJid,
                record.senderJid ?? null,
                record.participantJid ?? null,
                record.fromMe,
                record.timestampMs ?? null,
                record.encType ?? null,
                record.plaintext ?? null,
                record.messageBytes ?? null
            ]
        })
    }

    public async upsertBatch(records: readonly WaStoredMessageRecord[]): Promise<void> {
        if (records.length === 0) return

        await this.withTransaction(async (client) => {
            for (const record of records) {
                await client.query({
                    name: this.stmtName('msg_upsert'),
                    text: `INSERT INTO ${this.t('mailbox_messages')} (
                        session_id, message_id, thread_jid, sender_jid, participant_jid,
                        from_me, timestamp_ms, enc_type, plaintext, message_bytes
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (session_id, message_id) DO UPDATE SET
                        thread_jid = EXCLUDED.thread_jid,
                        sender_jid = EXCLUDED.sender_jid,
                        participant_jid = EXCLUDED.participant_jid,
                        from_me = EXCLUDED.from_me,
                        timestamp_ms = EXCLUDED.timestamp_ms,
                        enc_type = EXCLUDED.enc_type,
                        plaintext = EXCLUDED.plaintext,
                        message_bytes = EXCLUDED.message_bytes`,
                    values: [
                        this.sessionId,
                        record.id,
                        record.threadJid,
                        record.senderJid ?? null,
                        record.participantJid ?? null,
                        record.fromMe,
                        record.timestampMs ?? null,
                        record.encType ?? null,
                        record.plaintext ?? null,
                        record.messageBytes ?? null
                    ]
                })
            }
        })
    }

    public async getById(id: string): Promise<WaStoredMessageRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('msg_get_by_id'),
                text: `SELECT message_id, thread_jid, sender_jid, participant_jid,
                    from_me, timestamp_ms, enc_type, plaintext, message_bytes
             FROM ${this.t('mailbox_messages')}
             WHERE session_id = $1 AND message_id = $2`,
                values: [this.sessionId, id]
            })
        )
        if (!row) return null
        return rowToRecord(row)
    }

    public async listByThread(
        threadJid: string,
        limit?: number,
        beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]> {
        await this.ensureReady()
        const resolved = safeLimit(limit, 50)

        if (beforeTimestampMs !== undefined) {
            return queryRows(
                await this.pool.query({
                    name: this.stmtName('msg_list_thread_before'),
                    text: `SELECT message_id, thread_jid, sender_jid, participant_jid,
                        from_me, timestamp_ms, enc_type, plaintext, message_bytes
                 FROM ${this.t('mailbox_messages')}
                 WHERE session_id = $1 AND thread_jid = $2 AND timestamp_ms < $3
                 ORDER BY timestamp_ms DESC, message_id DESC
                 LIMIT $4`,
                    values: [this.sessionId, threadJid, beforeTimestampMs, resolved]
                })
            ).map(rowToRecord)
        }

        return queryRows(
            await this.pool.query({
                name: this.stmtName('msg_list_thread'),
                text: `SELECT message_id, thread_jid, sender_jid, participant_jid,
                    from_me, timestamp_ms, enc_type, plaintext, message_bytes
             FROM ${this.t('mailbox_messages')}
             WHERE session_id = $1 AND thread_jid = $2
             ORDER BY timestamp_ms DESC, message_id DESC
             LIMIT $3`,
                values: [this.sessionId, threadJid, resolved]
            })
        ).map(rowToRecord)
    }

    public async deleteById(id: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('msg_delete_by_id'),
                text: `DELETE FROM ${this.t('mailbox_messages')}
             WHERE session_id = $1 AND message_id = $2`,
                values: [this.sessionId, id]
            })
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('msg_clear'),
            text: `DELETE FROM ${this.t('mailbox_messages')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
