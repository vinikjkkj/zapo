import type { WaContactStore, WaStoredContactRecord } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryFirst } from './helpers'
import type { WaMysqlStorageOptions } from './types'

export class WaContactMysqlStore extends BaseMysqlStore implements WaContactStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('mailbox_contacts')} (
                session_id, jid, display_name, push_name, lid,
                phone_number, last_updated_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                display_name = COALESCE(VALUES(display_name), display_name),
                push_name = COALESCE(VALUES(push_name), push_name),
                lid = COALESCE(VALUES(lid), lid),
                phone_number = COALESCE(VALUES(phone_number), phone_number),
                last_updated_ms = VALUES(last_updated_ms)`,
            [
                this.sessionId,
                record.jid,
                record.displayName ?? null,
                record.pushName ?? null,
                record.lid ?? null,
                record.phoneNumber ?? null,
                record.lastUpdatedMs
            ]
        )
    }

    public async upsertBatch(records: readonly WaStoredContactRecord[]): Promise<void> {
        if (records.length === 0) return

        await this.withTransaction(async (conn) => {
            for (const record of records) {
                await conn.execute(
                    `INSERT INTO ${this.t('mailbox_contacts')} (
                        session_id, jid, display_name, push_name, lid,
                        phone_number, last_updated_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        display_name = COALESCE(VALUES(display_name), display_name),
                        push_name = COALESCE(VALUES(push_name), push_name),
                        lid = COALESCE(VALUES(lid), lid),
                        phone_number = COALESCE(VALUES(phone_number), phone_number),
                        last_updated_ms = VALUES(last_updated_ms)`,
                    [
                        this.sessionId,
                        record.jid,
                        record.displayName ?? null,
                        record.pushName ?? null,
                        record.lid ?? null,
                        record.phoneNumber ?? null,
                        record.lastUpdatedMs
                    ]
                )
            }
        })
    }

    public async getByJid(jid: string): Promise<WaStoredContactRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT jid, display_name, push_name, lid,
                    phone_number, last_updated_ms
             FROM ${this.t('mailbox_contacts')}
             WHERE session_id = ? AND jid = ?`,
                [this.sessionId, jid]
            )
        )
        if (!row) return null
        return {
            jid: row.jid as string,
            displayName: (row.display_name as string | null) ?? undefined,
            pushName: (row.push_name as string | null) ?? undefined,
            lid: (row.lid as string | null) ?? undefined,
            phoneNumber: (row.phone_number as string | null) ?? undefined,
            lastUpdatedMs: Number(row.last_updated_ms)
        }
    }

    public async deleteByJid(jid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.execute(
                `DELETE FROM ${this.t('mailbox_contacts')}
             WHERE session_id = ? AND jid = ?`,
                [this.sessionId, jid]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(`DELETE FROM ${this.t('mailbox_contacts')} WHERE session_id = ?`, [
            this.sessionId
        ])
    }
}
