import type {
    WaPrivacyTokenStore,
    WaStoredPrivacyTokenRecord
} from '@store/contracts/privacy-token.store'
import { BaseSqliteStore } from '@store/providers/sqlite/BaseSqliteStore'
import type { WaSqliteStorageOptions } from '@store/types'
import { asNumber, asOptionalBytes, asOptionalNumber, asString } from '@util/coercion'

interface PrivacyTokenRow extends Record<string, unknown> {
    readonly jid: unknown
    readonly tc_token: unknown
    readonly tc_token_timestamp: unknown
    readonly tc_token_sender_timestamp: unknown
    readonly nct_salt: unknown
    readonly updated_at_ms: unknown
}

export class WaPrivacyTokenSqliteStore extends BaseSqliteStore implements WaPrivacyTokenStore {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['privacyToken'])
    }

    public async upsert(record: WaStoredPrivacyTokenRecord): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO privacy_tokens (
                session_id, jid, tc_token, tc_token_timestamp,
                tc_token_sender_timestamp, nct_salt, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id, jid) DO UPDATE SET
                tc_token=COALESCE(excluded.tc_token, privacy_tokens.tc_token),
                tc_token_timestamp=COALESCE(excluded.tc_token_timestamp, privacy_tokens.tc_token_timestamp),
                tc_token_sender_timestamp=COALESCE(excluded.tc_token_sender_timestamp, privacy_tokens.tc_token_sender_timestamp),
                nct_salt=COALESCE(excluded.nct_salt, privacy_tokens.nct_salt),
                updated_at_ms=excluded.updated_at_ms`,
            [
                this.options.sessionId,
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
        if (records.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (let i = 0; i < records.length; i += 1) {
                const record = records[i]
                db.run(
                    `INSERT INTO privacy_tokens (
                        session_id, jid, tc_token, tc_token_timestamp,
                        tc_token_sender_timestamp, nct_salt, updated_at_ms
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id, jid) DO UPDATE SET
                        tc_token=COALESCE(excluded.tc_token, privacy_tokens.tc_token),
                        tc_token_timestamp=COALESCE(excluded.tc_token_timestamp, privacy_tokens.tc_token_timestamp),
                        tc_token_sender_timestamp=COALESCE(excluded.tc_token_sender_timestamp, privacy_tokens.tc_token_sender_timestamp),
                        nct_salt=COALESCE(excluded.nct_salt, privacy_tokens.nct_salt),
                        updated_at_ms=excluded.updated_at_ms`,
                    [
                        this.options.sessionId,
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
        const db = await this.getConnection()
        const row = db.get<PrivacyTokenRow>(
            `SELECT jid, tc_token, tc_token_timestamp, tc_token_sender_timestamp,
                    nct_salt, updated_at_ms
             FROM privacy_tokens
             WHERE session_id = ? AND jid = ?
             LIMIT 1`,
            [this.options.sessionId, jid]
        )
        if (!row) {
            return null
        }
        return this.rowToRecord(row)
    }

    public async deleteByJid(jid: string): Promise<number> {
        const db = await this.getConnection()
        db.run('DELETE FROM privacy_tokens WHERE session_id = ? AND jid = ?', [
            this.options.sessionId,
            jid
        ])
        const result = db.get<Record<string, unknown>>('SELECT changes() AS total', [])
        return result ? Number(result.total) : 0
    }

    public async clear(): Promise<void> {
        const db = await this.getConnection()
        db.run('DELETE FROM privacy_tokens WHERE session_id = ?', [this.options.sessionId])
    }

    private rowToRecord(row: PrivacyTokenRow): WaStoredPrivacyTokenRecord {
        return {
            jid: asString(row.jid, 'privacy_tokens.jid'),
            tcToken: asOptionalBytes(row.tc_token, 'privacy_tokens.tc_token'),
            tcTokenTimestamp: asOptionalNumber(
                row.tc_token_timestamp,
                'privacy_tokens.tc_token_timestamp'
            ),
            tcTokenSenderTimestamp: asOptionalNumber(
                row.tc_token_sender_timestamp,
                'privacy_tokens.tc_token_sender_timestamp'
            ),
            nctSalt: asOptionalBytes(row.nct_salt, 'privacy_tokens.nct_salt'),
            updatedAtMs: asNumber(row.updated_at_ms, 'privacy_tokens.updated_at_ms')
        }
    }
}
