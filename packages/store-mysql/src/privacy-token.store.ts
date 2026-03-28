import type { WaPrivacyTokenStore, WaStoredPrivacyTokenRecord } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, queryFirst, toBytesOrNull } from './helpers'
import type { WaMysqlStorageOptions } from './types'

export class WaPrivacyTokenMysqlStore extends BaseMysqlStore implements WaPrivacyTokenStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['privacyToken'])
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('privacy_tokens')} (
                session_id, jid, tc_token, tc_token_timestamp,
                tc_token_sender_timestamp, nct_salt, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                tc_token = COALESCE(VALUES(tc_token), tc_token),
                tc_token_timestamp = COALESCE(VALUES(tc_token_timestamp), tc_token_timestamp),
                tc_token_sender_timestamp = COALESCE(VALUES(tc_token_sender_timestamp), tc_token_sender_timestamp),
                nct_salt = COALESCE(VALUES(nct_salt), nct_salt),
                updated_at_ms = VALUES(updated_at_ms)`,
            [
                this.sessionId,
                record.jid,
                record.tcToken ?? null,
                record.tcTokenTimestamp ?? null,
                record.tcTokenSenderTimestamp ?? null,
                record.nctSalt ?? null,
                record.updatedAtMs
            ]
        )
    }

    public async upsertBatch(records: readonly WaStoredPrivacyTokenRecord[]): Promise<void> {
        if (records.length === 0) return

        await this.withTransaction(async (conn) => {
            for (const record of records) {
                await conn.execute(
                    `INSERT INTO ${this.t('privacy_tokens')} (
                        session_id, jid, tc_token, tc_token_timestamp,
                        tc_token_sender_timestamp, nct_salt, updated_at_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        tc_token = COALESCE(VALUES(tc_token), tc_token),
                        tc_token_timestamp = COALESCE(VALUES(tc_token_timestamp), tc_token_timestamp),
                        tc_token_sender_timestamp = COALESCE(VALUES(tc_token_sender_timestamp), tc_token_sender_timestamp),
                        nct_salt = COALESCE(VALUES(nct_salt), nct_salt),
                        updated_at_ms = VALUES(updated_at_ms)`,
                    [
                        this.sessionId,
                        record.jid,
                        record.tcToken ?? null,
                        record.tcTokenTimestamp ?? null,
                        record.tcTokenSenderTimestamp ?? null,
                        record.nctSalt ?? null,
                        record.updatedAtMs
                    ]
                )
            }
        })
    }

    public async getByJid(jid: string): Promise<WaStoredPrivacyTokenRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT jid, tc_token, tc_token_timestamp,
                    tc_token_sender_timestamp, nct_salt, updated_at_ms
             FROM ${this.t('privacy_tokens')}
             WHERE session_id = ? AND jid = ?`,
                [this.sessionId, jid]
            )
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
            await this.pool.execute(
                `DELETE FROM ${this.t('privacy_tokens')}
             WHERE session_id = ? AND jid = ?`,
                [this.sessionId, jid]
            )
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(`DELETE FROM ${this.t('privacy_tokens')} WHERE session_id = ?`, [
            this.sessionId
        ])
    }

    public async destroy(): Promise<void> {
        // no-op
    }
}
