import type { PoolConnection } from 'mysql2/promise'
import type { WaMessageStore, WaStoredMessageRecord } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import {
    affectedRows,
    type MysqlRow,
    queryFirst,
    queryRows,
    safeLimit,
    toBytesOrNull
} from './helpers'
import type { MysqlParam, WaMysqlStorageOptions } from './types'

function rowToRecord(row: MysqlRow): WaStoredMessageRecord {
    return {
        id: row.message_id as string,
        threadJid: row.thread_jid as string,
        senderJid: (row.sender_jid as string | null) ?? undefined,
        participantJid: (row.participant_jid as string | null) ?? undefined,
        fromMe: Number(row.from_me) === 1,
        timestampMs: row.timestamp_ms !== null ? Number(row.timestamp_ms) : undefined,
        messageBytes: toBytesOrNull(row.message_bytes) ?? undefined
    }
}

export class WaMessageMysqlStore extends BaseMysqlStore implements WaMessageStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredMessageRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('mailbox_messages')} (
                session_id, message_id, thread_jid, sender_jid, participant_jid,
                from_me, timestamp_ms, message_bytes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                thread_jid = VALUES(thread_jid),
                sender_jid = VALUES(sender_jid),
                participant_jid = VALUES(participant_jid),
                from_me = VALUES(from_me),
                timestamp_ms = VALUES(timestamp_ms),
                message_bytes = VALUES(message_bytes)`,
            [
                this.sessionId,
                record.id,
                record.threadJid,
                record.senderJid ?? null,
                record.participantJid ?? null,
                record.fromMe ? 1 : 0,
                record.timestampMs ?? null,
                record.messageBytes ?? null
            ]
        )
    }

    public async upsertBatch(records: readonly WaStoredMessageRecord[]): Promise<void> {
        if (records.length === 0) return
        const runChunk = async (
            executor: { execute: PoolConnection['execute'] },
            chunk: readonly WaStoredMessageRecord[]
        ): Promise<void> => {
            const placeholders = chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')
            const params: MysqlParam[] = []
            for (const record of chunk) {
                params.push(
                    this.sessionId,
                    record.id,
                    record.threadJid,
                    record.senderJid ?? null,
                    record.participantJid ?? null,
                    record.fromMe ? 1 : 0,
                    record.timestampMs ?? null,
                    record.messageBytes ?? null
                )
            }
            await executor.execute(
                `INSERT INTO ${this.t('mailbox_messages')} (
                    session_id, message_id, thread_jid, sender_jid, participant_jid,
                    from_me, timestamp_ms, message_bytes
                ) VALUES ${placeholders}
                ON DUPLICATE KEY UPDATE
                    thread_jid = VALUES(thread_jid),
                    sender_jid = VALUES(sender_jid),
                    participant_jid = VALUES(participant_jid),
                    from_me = VALUES(from_me),
                    timestamp_ms = VALUES(timestamp_ms),
                    message_bytes = VALUES(message_bytes)`,
                params
            )
        }
        const sizes = this.powerOfTwoChunks(records.length)
        if (sizes.length === 1) {
            await this.ensureReady()
            await runChunk(this.pool, records)
            return
        }
        await this.withTransaction(async (conn) => {
            let cursor = 0
            for (const size of sizes) {
                await runChunk(conn, records.slice(cursor, cursor + size))
                cursor += size
            }
        })
    }

    public async getById(id: string): Promise<WaStoredMessageRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT message_id, thread_jid, sender_jid, participant_jid,
                    from_me, timestamp_ms, message_bytes
             FROM ${this.t('mailbox_messages')}
             WHERE session_id = ? AND message_id = ?`,
                [this.sessionId, id]
            )
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
                await this.pool.execute(
                    `SELECT message_id, thread_jid, sender_jid, participant_jid,
                        from_me, timestamp_ms, message_bytes
                 FROM ${this.t('mailbox_messages')}
                 WHERE session_id = ? AND thread_jid = ? AND timestamp_ms < ?
                 ORDER BY timestamp_ms DESC, message_id DESC
                 LIMIT ${resolved}`,
                    [this.sessionId, threadJid, beforeTimestampMs]
                )
            ).map(rowToRecord)
        }

        return queryRows(
            await this.pool.execute(
                `SELECT message_id, thread_jid, sender_jid, participant_jid,
                    from_me, timestamp_ms, message_bytes
             FROM ${this.t('mailbox_messages')}
             WHERE session_id = ? AND thread_jid = ?
             ORDER BY timestamp_ms DESC, message_id DESC
             LIMIT ${resolved}`,
                [this.sessionId, threadJid]
            )
        ).map(rowToRecord)
    }

    public async deleteById(id: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('mailbox_messages')}
             WHERE session_id = ? AND message_id = ?`,
                [this.sessionId, id]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(`DELETE FROM ${this.t('mailbox_messages')} WHERE session_id = ?`, [
            this.sessionId
        ])
    }
}
