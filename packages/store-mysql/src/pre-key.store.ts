import type { PoolConnection } from 'mysql2/promise'
import type { KyberPreKeyRecord, PreKeyRecord } from 'zapo-js/signal'
import type { WaPqPreKeyStore, WaPreKeyStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { affectedRows, type MysqlRow, queryFirst, queryRows, safeLimit, toBytes } from './helpers'
import type { MysqlParam, WaMysqlStorageOptions } from './types'

const BATCH_SIZE = 250
const FIXED_IN_PLACEHOLDERS = Array.from({ length: BATCH_SIZE }, () => '?').join(', ')

/** Kyber pre-key ids are 3 bytes on the wire; the id counter wraps just before 2^24. */
const KYBER_PREKEY_ID_BORDER = 16_777_215

export class WaPreKeyMysqlStore extends BaseMysqlStore implements WaPreKeyStore, WaPqPreKeyStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['signal'])
    }

    // ── PreKeys ───────────────────────────────────────────────────────

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        await this.withTransaction(async (conn) => {
            await this.ensureMetaRow(conn)
            await this.upsertPreKey(conn, record)
            await conn.execute(
                `UPDATE ${this.t('signal_meta')}
                 SET next_prekey_id = GREATEST(next_prekey_id, ?)
                 WHERE session_id = ?`,
                [record.keyId + 1, this.sessionId]
            )
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
            const reservation = await this.withTransaction(async (conn) => {
                await this.ensureMetaRow(conn)
                const available = await this.selectAvailablePreKeys(conn, count)
                const missing = count - available.length
                if (missing <= 0) {
                    return { available, reservedKeyIds: [] as number[] }
                }
                const meta = await this.getMeta(conn)
                const reservedKeyIds = Array.from(
                    { length: missing },
                    (_, i) => meta.nextPreKeyId + i
                )
                await conn.execute(
                    `UPDATE ${this.t('signal_meta')}
                     SET next_prekey_id = GREATEST(next_prekey_id, ?)
                     WHERE session_id = ?`,
                    [meta.nextPreKeyId + missing, this.sessionId]
                )
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

            const insertedCount = await this.withTransaction(async (conn) => {
                await this.ensureMetaRow(conn)
                const sizes = this.powerOfTwoChunks(generated.length)
                let cursor = 0
                let inserted = 0
                for (const size of sizes) {
                    const chunk = generated.slice(cursor, cursor + size)
                    cursor += size
                    const placeholders = chunk.map(() => '(?, ?, ?, ?, ?)').join(', ')
                    const params: MysqlParam[] = []
                    for (const record of chunk) {
                        params.push(
                            this.sessionId,
                            record.keyId,
                            record.keyPair.pubKey,
                            record.keyPair.privKey,
                            record.uploaded === true ? 1 : 0
                        )
                    }
                    inserted += affectedRows(
                        await conn.execute(
                            `INSERT IGNORE INTO ${this.t('signal_prekey')} (
                                session_id, key_id, pub_key, priv_key, uploaded
                            ) VALUES ${placeholders}`,
                            params
                        )
                    )
                }
                await conn.execute(
                    `UPDATE ${this.t('signal_meta')}
                     SET next_prekey_id = GREATEST(next_prekey_id, ?)
                     WHERE session_id = ?`,
                    [maxId + 1, this.sessionId]
                )
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

            const available = await this.withTransaction(async (conn) =>
                this.selectAvailablePreKeys(conn, count)
            )
            if (available.length >= count) {
                return available
            }
        }
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT key_id, pub_key, priv_key, uploaded
             FROM ${this.t('signal_prekey')}
             WHERE session_id = ? AND key_id = ?`,
                [this.sessionId, keyId]
            )
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
            while (batch.length < BATCH_SIZE) batch.push(-1)
            const params: MysqlParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT key_id, pub_key, priv_key, uploaded
                 FROM ${this.t('signal_prekey')}
                 WHERE session_id = ? AND key_id IN (${FIXED_IN_PLACEHOLDERS})`,
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
        return this.withTransaction(async (conn) => {
            const row = queryFirst(
                await conn.execute(
                    `SELECT key_id, pub_key, priv_key, uploaded
                 FROM ${this.t('signal_prekey')}
                 WHERE session_id = ? AND key_id = ?
                 FOR UPDATE`,
                    [this.sessionId, keyId]
                )
            )
            if (!row) return null
            await conn.execute(
                `DELETE FROM ${this.t('signal_prekey')}
                 WHERE session_id = ? AND key_id = ?`,
                [this.sessionId, keyId]
            )
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
        const meta = await this.withTransaction(async (conn) => this.getMeta(conn))
        if (keyId < 0 || keyId >= meta.nextPreKeyId) {
            throw new Error(`prekey ${keyId} is out of boundary`)
        }
        await this.pool.execute(
            `UPDATE ${this.t('signal_prekey')}
             SET uploaded = 1
             WHERE session_id = ? AND key_id <= ?`,
            [this.sessionId, keyId]
        )
    }

    // ── Kyber PreKeys (ML-KEM-1024) ───────────────────────────────────

    public async putKyberPreKeys(records: readonly KyberPreKeyRecord[]): Promise<void> {
        if (records.length === 0) return
        await this.withTransaction(async (conn) => {
            for (const record of records) {
                await conn.execute(
                    `INSERT INTO ${this.t('signal_kyber_prekey')} (
                        session_id, key_id, pub_key, priv_key, signature, last_resort
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        pub_key = VALUES(pub_key),
                        priv_key = VALUES(priv_key),
                        signature = VALUES(signature),
                        last_resort = VALUES(last_resort)`,
                    [
                        this.sessionId,
                        record.keyId,
                        record.keyPair.pubKey,
                        record.keyPair.privKey,
                        record.signature,
                        record.lastResort === true ? 1 : 0
                    ]
                )
            }
        })
    }

    public async getKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT key_id, pub_key, priv_key, signature, last_resort
             FROM ${this.t('signal_kyber_prekey')}
             WHERE session_id = ? AND key_id = ?`,
                [this.sessionId, keyId]
            )
        )
        if (!row) return null
        return this.decodeKyberPreKeyRow(row)
    }

    public async consumeKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        return this.withTransaction(async (conn) => {
            const row = queryFirst(
                await conn.execute(
                    `SELECT key_id, pub_key, priv_key, signature, last_resort
                 FROM ${this.t('signal_kyber_prekey')}
                 WHERE session_id = ? AND key_id = ?
                 FOR UPDATE`,
                    [this.sessionId, keyId]
                )
            )
            if (!row) return null
            const record = this.decodeKyberPreKeyRow(row)
            if (record.lastResort !== true) {
                await conn.execute(
                    `DELETE FROM ${this.t('signal_kyber_prekey')}
                     WHERE session_id = ? AND key_id = ?`,
                    [this.sessionId, keyId]
                )
            }
            return record
        })
    }

    public async removeKyberPreKeys(keyIds: readonly number[]): Promise<void> {
        if (keyIds.length === 0) return
        const uniqueKeyIds = [...new Set(keyIds)]
        await this.withTransaction(async (conn) => {
            for (let start = 0; start < uniqueKeyIds.length; start += BATCH_SIZE) {
                const batch = uniqueKeyIds.slice(start, start + BATCH_SIZE)
                while (batch.length < BATCH_SIZE) batch.push(-1)
                const params: MysqlParam[] = [this.sessionId, ...batch]
                await conn.execute(
                    `DELETE FROM ${this.t('signal_kyber_prekey')}
                     WHERE session_id = ? AND key_id IN (${FIXED_IN_PLACEHOLDERS})`,
                    params
                )
            }
        })
    }

    public async getLatestKyberLastResortKey(): Promise<KyberPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT key_id, pub_key, priv_key, signature, last_resort
             FROM ${this.t('signal_kyber_prekey')}
             WHERE session_id = ? AND last_resort = 1
             ORDER BY key_id DESC
             LIMIT 1`,
                [this.sessionId]
            )
        )
        if (!row) return null
        return this.decodeKyberPreKeyRow(row)
    }

    public async reserveKyberPreKeyIds(count: number): Promise<number> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid kyber prekey count: ${count}`)
        }
        return this.withTransaction(async (conn) => {
            await this.ensureMetaRow(conn)
            const row = queryFirst(
                await conn.execute(
                    `SELECT next_kyber_prekey_id
                 FROM ${this.t('signal_meta')}
                 WHERE session_id = ?
                 FOR UPDATE`,
                    [this.sessionId]
                )
            )
            if (!row) throw new Error('signal meta row not found')
            const first = Number(row.next_kyber_prekey_id)
            await conn.execute(
                `UPDATE ${this.t('signal_meta')}
                 SET next_kyber_prekey_id = ?
                 WHERE session_id = ?`,
                [(first + count) % KYBER_PREKEY_ID_BORDER, this.sessionId]
            )
            return first
        })
    }

    public async getPqMigrated(): Promise<boolean> {
        return this.withTransaction(async (conn) => {
            await this.ensureMetaRow(conn)
            const row = queryFirst(
                await conn.execute(
                    `SELECT pq_migrated FROM ${this.t('signal_meta')} WHERE session_id = ?`,
                    [this.sessionId]
                )
            )
            if (!row) throw new Error('signal meta row not found')
            return Number(row.pq_migrated) === 1
        })
    }

    public async setPqMigrated(value: boolean): Promise<void> {
        await this.withTransaction(async (conn) => {
            await this.ensureMetaRow(conn)
            await conn.execute(
                `UPDATE ${this.t('signal_meta')}
                 SET pq_migrated = ?
                 WHERE session_id = ?`,
                [value ? 1 : 0, this.sessionId]
            )
        })
    }

    // ── Server State ──────────────────────────────────────────────────

    public async setServerHasPreKeys(value: boolean): Promise<void> {
        await this.withTransaction(async (conn) => {
            await this.ensureMetaRow(conn)
            await conn.execute(
                `UPDATE ${this.t('signal_meta')}
                 SET server_has_prekeys = ?
                 WHERE session_id = ?`,
                [value ? 1 : 0, this.sessionId]
            )
        })
    }

    public async getServerHasPreKeys(): Promise<boolean> {
        const meta = await this.withTransaction(async (conn) => this.getMeta(conn))
        return meta.serverHasPreKeys
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (conn) => {
            await conn.execute(`DELETE FROM ${this.t('signal_prekey')} WHERE session_id = ?`, [
                this.sessionId
            ])
            await conn.execute(
                `DELETE FROM ${this.t('signal_kyber_prekey')} WHERE session_id = ?`,
                [this.sessionId]
            )
            await conn.execute(
                `UPDATE ${this.t('signal_meta')}
                 SET server_has_prekeys = 0,
                     next_prekey_id = 1,
                     next_kyber_prekey_id = 1,
                     pq_migrated = 0
                 WHERE session_id = ?`,
                [this.sessionId]
            )
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async ensureMetaRow(conn: PoolConnection): Promise<void> {
        await conn.execute(
            `INSERT IGNORE INTO ${this.t('signal_meta')} (
                session_id, server_has_prekeys, next_prekey_id
            ) VALUES (?, 0, 1)`,
            [this.sessionId]
        )
    }

    private async getMeta(conn: PoolConnection): Promise<{
        serverHasPreKeys: boolean
        nextPreKeyId: number
    }> {
        await this.ensureMetaRow(conn)
        const row = queryFirst(
            await conn.execute(
                `SELECT server_has_prekeys, next_prekey_id
             FROM ${this.t('signal_meta')}
             WHERE session_id = ?`,
                [this.sessionId]
            )
        )
        if (!row) throw new Error('signal meta row not found')
        return {
            serverHasPreKeys: Number(row.server_has_prekeys) === 1,
            nextPreKeyId: Number(row.next_prekey_id)
        }
    }

    private async selectAvailablePreKeys(
        conn: PoolConnection,
        limit: number
    ): Promise<PreKeyRecord[]> {
        const resolved = safeLimit(limit, 100)
        return queryRows(
            await conn.execute(
                `SELECT key_id, pub_key, priv_key, uploaded
             FROM ${this.t('signal_prekey')}
             WHERE session_id = ? AND uploaded = 0
             ORDER BY key_id ASC
             LIMIT ${resolved}`,
                [this.sessionId]
            )
        ).map((row) => this.decodePreKeyRow(row))
    }

    private async upsertPreKey(conn: PoolConnection, record: PreKeyRecord): Promise<void> {
        await conn.execute(
            `INSERT INTO ${this.t('signal_prekey')} (
                session_id, key_id, pub_key, priv_key, uploaded
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                pub_key = VALUES(pub_key),
                priv_key = VALUES(priv_key),
                uploaded = VALUES(uploaded)`,
            [
                this.sessionId,
                record.keyId,
                record.keyPair.pubKey,
                record.keyPair.privKey,
                record.uploaded === true ? 1 : 0
            ]
        )
    }

    private decodePreKeyRow(row: MysqlRow): PreKeyRecord {
        return {
            keyId: Number(row.key_id),
            keyPair: {
                pubKey: toBytes(row.pub_key),
                privKey: toBytes(row.priv_key)
            },
            uploaded: row.uploaded !== null ? Number(row.uploaded) === 1 : undefined
        }
    }

    private decodeKyberPreKeyRow(row: MysqlRow): KyberPreKeyRecord {
        return {
            keyId: Number(row.key_id),
            keyPair: {
                pubKey: toBytes(row.pub_key),
                privKey: toBytes(row.priv_key)
            },
            signature: toBytes(row.signature),
            lastResort: Number(row.last_resort) === 1
        }
    }
}
