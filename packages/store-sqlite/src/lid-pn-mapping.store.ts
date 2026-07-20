import type { WaLidPnMappingStore } from 'zapo-js/store'
import { asOptionalString } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteStorageOptions } from './types'

/** SQLite-backed PN/LID mapping store scoped by Zapo session id. */
export class WaLidPnMappingSqliteStore extends BaseSqliteStore implements WaLidPnMappingStore {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['lidPnMapping'])
    }

    public async getLidUser(pnUser: string): Promise<string | null> {
        const db = await this.getConnection()
        const row = db.get<Record<string, unknown>>(
            `SELECT lid_user
             FROM signal_lid_pn_mapping
             WHERE session_id = ? AND pn_user = ?`,
            [this.options.sessionId, pnUser]
        )
        return row ? (asOptionalString(row.lid_user) ?? null) : null
    }

    public async getPnUser(lidUser: string): Promise<string | null> {
        const db = await this.getConnection()
        const row = db.get<Record<string, unknown>>(
            `SELECT pn_user
             FROM signal_lid_pn_mapping
             WHERE session_id = ? AND lid_user = ?`,
            [this.options.sessionId, lidUser]
        )
        return row ? (asOptionalString(row.pn_user) ?? null) : null
    }

    public async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        await this.withTransaction((db) => {
            db.run(
                `DELETE FROM signal_lid_pn_mapping
                 WHERE session_id = ? AND (pn_user = ? OR lid_user = ?)`,
                [this.options.sessionId, pnUser, lidUser]
            )
            db.run(
                `INSERT INTO signal_lid_pn_mapping (session_id, pn_user, lid_user)
                 VALUES (?, ?, ?)`,
                [this.options.sessionId, pnUser, lidUser]
            )
        })
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM signal_lid_pn_mapping WHERE session_id = ?', [this.options.sessionId])
    }
}
