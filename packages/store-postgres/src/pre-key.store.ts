import type { PoolClient } from 'pg'
import type { PreKeyRecord } from 'zapo-js/signal'
import type { WaPreKeyStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { queryFirst, queryRows, safeLimit, toBytes, type PgRow } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const BATCH_SIZE = 250

export class WaPreKeyPgStore extends BasePgStore implements WaPreKeyStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['signal'])
    }

    // ── PreKeys ───────────────────────────────────────────────────────

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        await this.withTransaction(async (client) => {
            await this.ensureMetaRow(client)
            await this.upsertPreKey(client, record)
            await this.updateNextPreKeyId(client, record.keyId + 1)
        })
    }

    public async getOrGenPreKeys(
        count: number,
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<readonly PreKeyRecord[]> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid prekey count: ${count}`)
        }

        while (true) {
            const reservation = await this.withTransaction(async (client) => {
                await this.ensureMetaRow(client)
                const available = await this.selectAvailablePreKeys(client, count)
                const missing = count - available.length
                if (missing <= 0) {
                    return { available, reservedKeyIds: [] as number[] }
                }
                const meta = await this.getMeta(client)
                const reservedKeyIds = Array.from(
                    { length: missing },
                    (_, i) => meta.nextPreKeyId + i
                )
                await this.updateNextPreKeyId(client, meta.nextPreKeyId + missing)
                return { available, reservedKeyIds }
            })

            if (reservation.reservedKeyIds.length === 0) {
                return reservation.available
            }

            const generated: PreKeyRecord[] = []
            let maxId = reservation.reservedKeyIds[reservation.reservedKeyIds.length - 1]
            for (const keyId of reservation.reservedKeyIds) {
                const record = await generator(keyId)
                generated.push(record)
                if (record.keyId > maxId) {
                    maxId = record.keyId
                }
            }

            await this.withTransaction(async (client) => {
                await this.ensureMetaRow(client)
                for (const record of generated) {
                    await client.query({
                        name: this.stmtName('prekey_insert_prekey_noop'),
                        text: `INSERT INTO ${this.t('signal_prekey')} (
                            session_id, key_id, pub_key, priv_key, uploaded
                        ) VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (session_id, key_id) DO NOTHING`,
                        values: [
                            this.sessionId,
                            record.keyId,
                            record.keyPair.pubKey,
                            record.keyPair.privKey,
                            record.uploaded === true ? 1 : 0
                        ]
                    })
                }
                await this.updateNextPreKeyId(client, maxId + 1)
            })

            const available = await this.withTransaction(async (client) =>
                this.selectAvailablePreKeys(client, count)
            )
            if (available.length >= count) {
                return available
            }
        }
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('prekey_get_prekey_by_id'),
                text: `SELECT key_id, pub_key, priv_key, uploaded
                 FROM ${this.t('signal_prekey')}
                 WHERE session_id = $1 AND key_id = $2`,
                values: [this.sessionId, keyId]
            })
        )
        if (!row) return null
        return this.decodePreKeyRow(row)
    }

    public async getPreKeysById(
        keyIds: readonly number[]
    ): Promise<readonly (PreKeyRecord | null)[]> {
        if (keyIds.length === 0) return []
        await this.ensureReady()
        const uniqueKeyIds = [...new Set(keyIds)]
        const byId = new Map<number, PreKeyRecord>()
        for (let start = 0; start < uniqueKeyIds.length; start += BATCH_SIZE) {
            const batch = uniqueKeyIds.slice(start, start + BATCH_SIZE)
            let paramIdx = 2
            const placeholders = batch.map(() => `$${paramIdx++}`).join(', ')
            const params: PgParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT key_id, pub_key, priv_key, uploaded
                     FROM ${this.t('signal_prekey')}
                     WHERE session_id = $1 AND key_id IN (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                const record = this.decodePreKeyRow(row)
                byId.set(record.keyId, record)
            }
        }
        return keyIds.map((id) => byId.get(id) ?? null)
    }

    public async consumePreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        return this.withTransaction(async (client) => {
            const row = queryFirst(
                await client.query({
                    name: this.stmtName('prekey_consume_prekey_select'),
                    text: `SELECT key_id, pub_key, priv_key, uploaded
                     FROM ${this.t('signal_prekey')}
                     WHERE session_id = $1 AND key_id = $2
                     FOR UPDATE`,
                    values: [this.sessionId, keyId]
                })
            )
            if (!row) return null
            await client.query({
                name: this.stmtName('prekey_consume_prekey_delete'),
                text: `DELETE FROM ${this.t('signal_prekey')}
                 WHERE session_id = $1 AND key_id = $2`,
                values: [this.sessionId, keyId]
            })
            return this.decodePreKeyRow(row)
        })
    }

    public async getOrGenSinglePreKey(
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<PreKeyRecord> {
        const records = await this.getOrGenPreKeys(1, generator)
        return records[0]
    }

    public async markKeyAsUploaded(keyId: number): Promise<void> {
        await this.ensureReady()
        const meta = await this.withTransaction(async (client) => this.getMeta(client))
        if (keyId < 0 || keyId >= meta.nextPreKeyId) {
            throw new Error(`prekey ${keyId} is out of boundary`)
        }
        await this.pool.query({
            name: this.stmtName('prekey_mark_key_uploaded'),
            text: `UPDATE ${this.t('signal_prekey')}
             SET uploaded = true
             WHERE session_id = $1 AND key_id <= $2`,
            values: [this.sessionId, keyId]
        })
    }

    // ── Server State ──────────────────────────────────────────────────

    public async setServerHasPreKeys(value: boolean): Promise<void> {
        await this.withTransaction(async (client) => {
            await this.ensureMetaRow(client)
            await client.query({
                name: this.stmtName('prekey_set_server_has_prekeys'),
                text: `UPDATE ${this.t('signal_meta')}
                 SET server_has_prekeys = $1
                 WHERE session_id = $2`,
                values: [value, this.sessionId]
            })
        })
    }

    public async getServerHasPreKeys(): Promise<boolean> {
        const meta = await this.withTransaction(async (client) => this.getMeta(client))
        return meta.serverHasPreKeys
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (client) => {
            await client.query({
                name: this.stmtName('prekey_clear_prekey'),
                text: `DELETE FROM ${this.t('signal_prekey')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('prekey_clear_reset_meta'),
                text: `UPDATE ${this.t('signal_meta')}
                 SET server_has_prekeys = false, next_prekey_id = 1
                 WHERE session_id = $1`,
                values: [this.sessionId]
            })
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async ensureMetaRow(client: PoolClient): Promise<void> {
        await client.query({
            name: this.stmtName('prekey_ensure_meta'),
            text: `INSERT INTO ${this.t('signal_meta')} (
                session_id, server_has_prekeys, next_prekey_id
            ) VALUES ($1, false, 1)
            ON CONFLICT (session_id) DO NOTHING`,
            values: [this.sessionId]
        })
    }

    private async getMeta(client: PoolClient): Promise<{
        serverHasPreKeys: boolean
        nextPreKeyId: number
    }> {
        await this.ensureMetaRow(client)
        const row = queryFirst(
            await client.query({
                name: this.stmtName('prekey_get_meta'),
                text: `SELECT server_has_prekeys, next_prekey_id, signed_prekey_rotation_ts
                 FROM ${this.t('signal_meta')}
                 WHERE session_id = $1`,
                values: [this.sessionId]
            })
        )
        if (!row) throw new Error('signal meta row not found')
        return {
            serverHasPreKeys: Number(row.server_has_prekeys) === 1,
            nextPreKeyId: Number(row.next_prekey_id)
        }
    }

    private async selectAvailablePreKeys(
        client: PoolClient,
        limit: number
    ): Promise<PreKeyRecord[]> {
        const resolved = safeLimit(limit, 100)
        return queryRows(
            await client.query({
                name: this.stmtName('prekey_select_available_prekeys'),
                text: `SELECT key_id, pub_key, priv_key, uploaded
                 FROM ${this.t('signal_prekey')}
                 WHERE session_id = $1 AND uploaded = false
                 ORDER BY key_id ASC
                 LIMIT $2`,
                values: [this.sessionId, resolved]
            })
        ).map((row) => this.decodePreKeyRow(row))
    }

    private async upsertPreKey(client: PoolClient, record: PreKeyRecord): Promise<void> {
        await client.query({
            name: this.stmtName('prekey_upsert_prekey'),
            text: `INSERT INTO ${this.t('signal_prekey')} (
                session_id, key_id, pub_key, priv_key, uploaded
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, key_id) DO UPDATE SET
                pub_key = EXCLUDED.pub_key,
                priv_key = EXCLUDED.priv_key,
                uploaded = EXCLUDED.uploaded`,
            values: [
                this.sessionId,
                record.keyId,
                record.keyPair.pubKey,
                record.keyPair.privKey,
                record.uploaded === true ? 1 : 0
            ]
        })
    }

    private async updateNextPreKeyId(client: PoolClient, minNextId: number): Promise<void> {
        await client.query({
            name: this.stmtName('prekey_update_next_prekey_id'),
            text: `UPDATE ${this.t('signal_meta')} SET next_prekey_id = GREATEST(next_prekey_id, $1) WHERE session_id = $2`,
            values: [minNextId, this.sessionId]
        })
    }

    private decodePreKeyRow(row: PgRow): PreKeyRecord {
        return {
            keyId: Number(row.key_id),
            keyPair: {
                pubKey: toBytes(row.pub_key),
                privKey: toBytes(row.priv_key)
            },
            uploaded: row.uploaded !== null ? Number(row.uploaded) === 1 : undefined
        }
    }
}
