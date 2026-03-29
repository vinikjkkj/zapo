import type { WaContactStore, WaStoredContactRecord } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryFirst } from './helpers'
import type { WaPgStorageOptions } from './types'

export class WaContactPgStore extends BasePgStore implements WaContactStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['mailbox'])
    }

    private upsertQuery(values: unknown[]) {
        return {
            name: this.stmtName('contact_upsert'),
            text: `INSERT INTO ${this.t('mailbox_contacts')} (session_id, jid, display_name, push_name, lid, phone_number, last_updated_ms) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (session_id, jid) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, ${this.t('mailbox_contacts')}.display_name), push_name = COALESCE(EXCLUDED.push_name, ${this.t('mailbox_contacts')}.push_name), lid = COALESCE(EXCLUDED.lid, ${this.t('mailbox_contacts')}.lid), phone_number = COALESCE(EXCLUDED.phone_number, ${this.t('mailbox_contacts')}.phone_number), last_updated_ms = EXCLUDED.last_updated_ms`,
            values
        }
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.query(
            this.upsertQuery([
                this.sessionId,
                record.jid,
                record.displayName ?? null,
                record.pushName ?? null,
                record.lid ?? null,
                record.phoneNumber ?? null,
                record.lastUpdatedMs
            ])
        )
    }

    public async upsertBatch(records: readonly WaStoredContactRecord[]): Promise<void> {
        if (records.length === 0) return

        await this.withTransaction(async (client) => {
            for (const record of records) {
                await client.query(
                    this.upsertQuery([
                        this.sessionId,
                        record.jid,
                        record.displayName ?? null,
                        record.pushName ?? null,
                        record.lid ?? null,
                        record.phoneNumber ?? null,
                        record.lastUpdatedMs
                    ])
                )
            }
        })
    }

    public async getByJid(jid: string): Promise<WaStoredContactRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('contact_get_by_jid'),
                text: `SELECT jid, display_name, push_name, lid,
                    phone_number, last_updated_ms
             FROM ${this.t('mailbox_contacts')}
             WHERE session_id = $1 AND jid = $2`,
                values: [this.sessionId, jid]
            })
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
            await this.pool.query({
                name: this.stmtName('contact_delete_by_jid'),
                text: `DELETE FROM ${this.t('mailbox_contacts')}
             WHERE session_id = $1 AND jid = $2`,
                values: [this.sessionId, jid]
            })
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('contact_clear'),
            text: `DELETE FROM ${this.t('mailbox_contacts')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
