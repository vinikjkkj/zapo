import type { WaLidPnMappingStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst } from './helpers'
import type { WaMysqlStorageOptions } from './types'

/** MySQL-backed PN/LID mapping store scoped by Zapo session id. */
export class WaLidPnMappingMysqlStore extends BaseMysqlStore implements WaLidPnMappingStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['lidPnMapping'])
    }

    public async getLidUser(pnUser: string): Promise<string | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT lid_user
                 FROM ${this.t('signal_lid_pn_mapping')}
                 WHERE session_id = ? AND pn_user = ?`,
                [this.sessionId, pnUser]
            )
        )
        return row ? String(row.lid_user) : null
    }

    public async getPnUser(lidUser: string): Promise<string | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT pn_user
                 FROM ${this.t('signal_lid_pn_mapping')}
                 WHERE session_id = ? AND lid_user = ?`,
                [this.sessionId, lidUser]
            )
        )
        return row ? String(row.pn_user) : null
    }

    public async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        await this.withTransaction(async (connection) => {
            await connection.execute(
                `DELETE FROM ${this.t('signal_lid_pn_mapping')}
                 WHERE session_id = ? AND (pn_user = ? OR lid_user = ?)`,
                [this.sessionId, pnUser, lidUser]
            )
            await connection.execute(
                `INSERT INTO ${this.t('signal_lid_pn_mapping')} (session_id, pn_user, lid_user)
                 VALUES (?, ?, ?)`,
                [this.sessionId, pnUser, lidUser]
            )
        })
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `DELETE FROM ${this.t('signal_lid_pn_mapping')} WHERE session_id = ?`,
            [this.sessionId]
        )
    }
}
