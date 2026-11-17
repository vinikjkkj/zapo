import type { PoolClient } from 'pg'
import type { KyberPreKeyRecord, PreKeyRecord } from 'zapo-js/signal'
import type { WaPqPreKeyStore, WaPreKeyStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { type PgRow, queryFirst, queryRows, safeLimit, toBytes } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const BATCH_SIZE = 250

/** Kyber pre-key ids are 3 bytes on the wire; the id counter wraps just before 2^24. */
const KYBER_PREKEY_ID_BORDER = 16_777_215

export class WaPreKeyPgStore extends BasePgStore implements WaPreKeyStore, WaPqPreKeyStore {
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

            const insertedCount = await this.withTransaction(async (client) => {
                await this.ensureMetaRow(client)
                const sizes = this.powerOfTwoChunks(generated.length)
                let cursor = 0
                let inserted = 0
                for (const size of sizes) {
                    const chunk = generated.slice(cursor, cursor + size)
                    cursor += size
                    let paramIdx = 1
                    const placeholders = chunk
                        .map(() => {
                            const p = `($${paramIdx}, $${paramIdx + 1}, $${paramIdx + 2}, $${paramIdx + 3}, $${paramIdx + 4})`
                            paramIdx += 5
                            return p
                        })
                        .join(', ')
                    const params: PgParam[] = []
                    for (const record of chunk) {
                        params.push(
                            this.sessionId,
                            record.keyId,
                            record.keyPair.pubKey,
                            record.keyPair.privKey,
                            record.uploaded === true ? 1 : 0
                        )
                    }
                    const result = await client.query({
                        name: this.stmtName(`prekey_insert_batch_${chunk.length}`),
                        text: `INSERT INTO ${this.t('signal_prekey')} (
                            session_id, key_id, pub_key, priv_key, uploaded
                        ) VALUES ${placeholders}
                        ON CONFLICT (session_id, key_id) DO NOTHING`,
                        values: params
                    })
                    inserted += result.rowCount ?? 0
                }
                await this.updateNextPreKeyId(client, maxId + 1)
                return inserted
            })

            // No new rows: the generator returned already-stored key ids (insert
            // no-op). Bail instead of looping; robust to a concurrent consume.
            if (insertedCount === 0) {
                throw new Error(
                    'getOrGenPreKeys made no progress; the generator returned key ids ' +
                        'that collide with stored prekeys'
                )
            }

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

    // ── Kyber PreKeys ─────────────────────────────────────────────────

    public async putKyberPreKeys(records: readonly KyberPreKeyRecord[]): Promise<void> {
        if (records.length === 0) return
        await this.withTransaction(async (client) => {
            for (const record of records) {
                await client.query({
                    name: this.stmtName('prekey_upsert_kyber_prekey'),
                    text: `INSERT INTO ${this.t('signal_kyber_prekey')} (
                        session_id, key_id, pub_key, priv_key, signature, last_resort
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (session_id, key_id) DO UPDATE SET
                        pub_key = EXCLUDED.pub_key,
                        priv_key = EXCLUDED.priv_key,
                        signature = EXCLUDED.signature,
                        last_resort = EXCLUDED.last_resort`,
                    values: [
                        this.sessionId,
                        record.keyId,
                        record.keyPair.pubKey,
                        record.keyPair.privKey,
                        record.signature,
                        record.lastResort === true
                    ]
                })
            }
        })
    }

    public async getKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('prekey_get_kyber_prekey_by_id'),
                text: `SELECT key_id, pub_key, priv_key, signature, last_resort
                 FROM ${this.t('signal_kyber_prekey')}
                 WHERE session_id = $1 AND key_id = $2`,
                values: [this.sessionId, keyId]
            })
        )
        if (!row) return null
        return this.decodeKyberPreKeyRow(row)
    }

    public async consumeKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        return this.withTransaction(async (client) => {
            const row = queryFirst(
                await client.query({
                    name: this.stmtName('prekey_consume_kyber_prekey_select'),
                    text: `SELECT key_id, pub_key, priv_key, signature, last_resort
                     FROM ${this.t('signal_kyber_prekey')}
                     WHERE session_id = $1 AND key_id = $2
                     FOR UPDATE`,
                    values: [this.sessionId, keyId]
                })
            )
            if (!row) return null
            const record = this.decodeKyberPreKeyRow(row)
            if (record.lastResort !== true) {
                await client.query({
                    name: this.stmtName('prekey_consume_kyber_prekey_delete'),
                    text: `DELETE FROM ${this.t('signal_kyber_prekey')}
                     WHERE session_id = $1 AND key_id = $2`,
                    values: [this.sessionId, keyId]
                })
            }
            return record
        })
    }

    public async removeKyberPreKeys(keyIds: readonly number[]): Promise<void> {
        if (keyIds.length === 0) return
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('prekey_remove_kyber_prekeys'),
            text: `DELETE FROM ${this.t('signal_kyber_prekey')}
             WHERE session_id = $1 AND key_id = ANY($2::bigint[])`,
            values: [this.sessionId, [...new Set(keyIds)]]
        })
    }

    public async getLatestKyberLastResortKey(): Promise<KyberPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('prekey_get_latest_kyber_last_resort'),
                text: `SELECT key_id, pub_key, priv_key, signature, last_resort
                 FROM ${this.t('signal_kyber_prekey')}
                 WHERE session_id = $1 AND last_resort = true
                 ORDER BY key_id DESC
                 LIMIT 1`,
                values: [this.sessionId]
            })
        )
        if (!row) return null
        return this.decodeKyberPreKeyRow(row)
    }

    public async reserveKyberPreKeyIds(count: number): Promise<number> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid kyber prekey count: ${count}`)
        }
        return this.withTransaction(async (client) => {
            await this.ensureMetaRow(client)
            const row = queryFirst(
                await client.query({
                    name: this.stmtName('prekey_reserve_kyber_ids_select'),
                    text: `SELECT next_kyber_prekey_id
                     FROM ${this.t('signal_meta')}
                     WHERE session_id = $1
                     FOR UPDATE`,
                    values: [this.sessionId]
                })
            )
            if (!row) throw new Error('signal meta row not found')
            const first = Number(row.next_kyber_prekey_id)
            await client.query({
                name: this.stmtName('prekey_reserve_kyber_ids_update'),
                text: `UPDATE ${this.t('signal_meta')}
                 SET next_kyber_prekey_id = $1
                 WHERE session_id = $2`,
                values: [(first + count) % KYBER_PREKEY_ID_BORDER, this.sessionId]
            })
            return first
        })
    }

    public async getPqMigrated(): Promise<boolean> {
        return this.withTransaction(async (client) => {
            await this.ensureMetaRow(client)
            const row = queryFirst(
                await client.query({
                    name: this.stmtName('prekey_get_pq_migrated'),
                    text: `SELECT pq_migrated FROM ${this.t('signal_meta')} WHERE session_id = $1`,
                    values: [this.sessionId]
                })
            )
            if (!row) throw new Error('signal meta row not found')
            return row.pq_migrated === true
        })
    }

    public async setPqMigrated(value: boolean): Promise<void> {
        await this.withTransaction(async (client) => {
            await this.ensureMetaRow(client)
            await client.query({
                name: this.stmtName('prekey_set_pq_migrated'),
                text: `UPDATE ${this.t('signal_meta')}
                 SET pq_migrated = $1
                 WHERE session_id = $2`,
                values: [value, this.sessionId]
            })
        })
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
                name: this.stmtName('prekey_clear_kyber_prekey'),
                text: `DELETE FROM ${this.t('signal_kyber_prekey')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('prekey_clear_reset_meta'),
                text: `UPDATE ${this.t('signal_meta')}
                 SET server_has_prekeys = false,
                     next_prekey_id = 1,
                     next_kyber_prekey_id = 1,
                     pq_migrated = false
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

    private decodeKyberPreKeyRow(row: PgRow): KyberPreKeyRecord {
        return {
            keyId: Number(row.key_id),
            keyPair: {
                pubKey: toBytes(row.pub_key),
                privKey: toBytes(row.priv_key)
            },
            signature: toBytes(row.signature),
            lastResort: row.last_resort === true
        }
    }
}
