import type { WaPrivacyTokenStore, WaStoredPrivacyTokenRecord } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { affectedRows, queryFirst, toBytesOrNull } from './helpers'
import type { WaPgStorageOptions } from './types'

export class WaPrivacyTokenPgStore extends BasePgStore implements WaPrivacyTokenStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['privacyToken'])
    }

    private upsertQuery(values: unknown[]) {
        return {
            name: this.stmtName('privtoken_upsert'),
            text: `INSERT INTO ${this.t('privacy_tokens')} (session_id, jid, tc_token, tc_token_timestamp, tc_token_sender_timestamp, nct_salt, updated_at_ms) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (session_id, jid) DO UPDATE SET tc_token = COALESCE(EXCLUDED.tc_token, ${this.t('privacy_tokens')}.tc_token), tc_token_timestamp = COALESCE(EXCLUDED.tc_token_timestamp, ${this.t('privacy_tokens')}.tc_token_timestamp), tc_token_sender_timestamp = COALESCE(EXCLUDED.tc_token_sender_timestamp, ${this.t('privacy_tokens')}.tc_token_sender_timestamp), nct_salt = COALESCE(EXCLUDED.nct_salt, ${this.t('privacy_tokens')}.nct_salt), updated_at_ms = EXCLUDED.updated_at_ms`,
            values
        }
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.query(
            this.upsertQuery([
                this.sessionId,
                record.jid,
                record.tcToken ?? null,
                record.tcTokenTimestamp ?? null,
                record.tcTokenSenderTimestamp ?? null,
                record.nctSalt ?? null,
                record.updatedAtMs
            ])
        )
    }

    public async upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void> {
        if (records.length === 0) return

        await this.withTransaction(async (client) => {
            for (const record of records) {
                await client.query(
                    this.upsertQuery([
                        this.sessionId,
                        record.jid,
                        record.tcToken ?? null,
                        record.tcTokenTimestamp ?? null,
                        record.tcTokenSenderTimestamp ?? null,
                        record.nctSalt ?? null,
                        record.updatedAtMs
                    ])
                )
            }
        })
    }

    public async getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('privtoken_get_by_jid'),
                text: `SELECT jid, tc_token, tc_token_timestamp,
                    tc_token_sender_timestamp, nct_salt, updated_at_ms
             FROM ${this.t('privacy_tokens')}
             WHERE session_id = $1 AND jid = $2`,
                values: [this.sessionId, jid]
            })
        )
        if (!row) return null
        return {
            jid: row.jid as string,
            tcToken: toBytesOrNull(row.tc_token) ?? undefined,
            tcTokenTimestamp:
                row.tc_token_timestamp !== null ? Number(row.tc_token_timestamp) : undefined,
            tcTokenSenderTimestamp:
                row.tc_token_sender_timestamp !== null
                    ? Number(row.tc_token_sender_timestamp)
                    : undefined,
            nctSalt: toBytesOrNull(row.nct_salt) ?? undefined,
            updatedAtMs: Number(row.updated_at_ms)
        }
    }

    public async deleteByJid(jid: string): Promise<number> {
        await this.ensureReady()
        return affectedRows(
            await this.pool.query({
                name: this.stmtName('privtoken_delete_by_jid'),
                text: `DELETE FROM ${this.t('privacy_tokens')}
             WHERE session_id = $1 AND jid = $2`,
                values: [this.sessionId, jid]
            })
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('privtoken_clear'),
            text: `DELETE FROM ${this.t('privacy_tokens')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }

    public async destroy(): Promise<void> {
        // no-op
    }
}
