import type {
    WaContactStore as Contract,
    WaStoredContactRecord
} from '@store/contracts/contact.store'
import { BaseSqliteStore } from '@store/providers/sqlite/BaseSqliteStore'
import type { WaSqliteStorageOptions } from '@store/types'
import { asNumber, asOptionalString, asString } from '@util/coercion'

interface ContactRow extends Record<string, unknown> {
    readonly jid: unknown
    readonly display_name: unknown
    readonly push_name: unknown
    readonly lid: unknown
    readonly phone_number: unknown
    readonly last_updated_ms: unknown
}

function decodeContactRow(row: ContactRow): WaStoredContactRecord {
    return {
        jid: asString(row.jid, 'mailbox_contacts.jid'),
        displayName: asOptionalString(row.display_name, 'mailbox_contacts.display_name'),
        pushName: asOptionalString(row.push_name, 'mailbox_contacts.push_name'),
        lid: asOptionalString(row.lid, 'mailbox_contacts.lid'),
        phoneNumber: asOptionalString(row.phone_number, 'mailbox_contacts.phone_number'),
        lastUpdatedMs: asNumber(row.last_updated_ms, 'mailbox_contacts.last_updated_ms')
    }
}

export class WaContactSqliteStore extends BaseSqliteStore implements Contract {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['mailbox'])
    }

    public async upsert(record: WaStoredContactRecord): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO mailbox_contacts (
                session_id,
                jid,
                display_name,
                push_name,
                lid,
                phone_number,
                last_updated_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, jid) DO UPDATE SET
                display_name=COALESCE(excluded.display_name, mailbox_contacts.display_name),
                push_name=COALESCE(excluded.push_name, mailbox_contacts.push_name),
                lid=COALESCE(excluded.lid, mailbox_contacts.lid),
                phone_number=COALESCE(excluded.phone_number, mailbox_contacts.phone_number),
                last_updated_ms=excluded.last_updated_ms`,
            [
                this.options.sessionId,
                record.jid,
                record.displayName ?? null,
                record.pushName ?? null,
                record.lid ?? null,
                record.phoneNumber ?? null,
                record.lastUpdatedMs
            ]
        )
    }

    public async getByJid(jid: string): Promise<WaStoredContactRecord | null> {
        const db = await this.getConnection()
        const row = db.get<ContactRow>(
            `SELECT jid, display_name, push_name, lid, phone_number, last_updated_ms
             FROM mailbox_contacts
             WHERE session_id = ? AND jid = ?`,
            [this.options.sessionId, jid]
        )
        return row ? decodeContactRow(row) : null
    }

    public async deleteByJid(jid: string): Promise<number> {
        const db = await this.getConnection()
        db.run(
            `DELETE FROM mailbox_contacts
             WHERE session_id = ? AND jid = ?`,
            [this.options.sessionId, jid]
        )
        const row = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return row ? Number(row.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM mailbox_contacts WHERE session_id = ?', [this.options.sessionId])
    }
}
