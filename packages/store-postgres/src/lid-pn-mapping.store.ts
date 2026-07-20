import type { WaLidPnMappingStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { queryFirst } from './helpers'
import type { WaPgStorageOptions } from './types'

/** PostgreSQL-backed PN/LID mapping store scoped by Zapo session id. */
export class WaLidPnMappingPgStore extends BasePgStore implements WaLidPnMappingStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['lidPnMapping'])
    }

    public async getLidUser(pnUser: string): Promise<string | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('lid_pn_mapping_get'),
                text: `SELECT lid_user
                       FROM ${this.t('signal_lid_pn_mapping')}
                       WHERE session_id = $1 AND pn_user = $2`,
                values: [this.sessionId, pnUser]
            })
        )
        return row ? String(row.lid_user) : null
    }

    public async getPnUser(lidUser: string): Promise<string | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('lid_pn_mapping_get_pn'),
                text: `SELECT pn_user
                       FROM ${this.t('signal_lid_pn_mapping')}
                       WHERE session_id = $1 AND lid_user = $2`,
                values: [this.sessionId, lidUser]
            })
        )
        return row ? String(row.pn_user) : null
    }

    public async setLidUser(pnUser: string, lidUser: string): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('lid_pn_mapping_set'),
            text: `WITH removed AS (
                       DELETE FROM ${this.t('signal_lid_pn_mapping')}
                       WHERE session_id = $1 AND (pn_user = $2 OR lid_user = $3)
                       RETURNING 1
                   )
                   INSERT INTO ${this.t('signal_lid_pn_mapping')} (session_id, pn_user, lid_user)
                   SELECT $1, $2, $3 FROM (SELECT count(*) FROM removed) AS deleted`,
            values: [this.sessionId, pnUser, lidUser]
        })
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('lid_pn_mapping_clear'),
            text: `DELETE FROM ${this.t('signal_lid_pn_mapping')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
