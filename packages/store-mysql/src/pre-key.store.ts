import type { PoolConnection } from 'mysql2/promise'
import type { PreKeyRecord } from 'zapo-js/signal'
import type { WaPreKeyStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst, queryRows, safeLimit, toBytes, type MysqlRow } from './helpers'
import type { MysqlParam, WaMysqlStorageOptions } from './types'

const BATCH_SIZE = 250
const FIXED_IN_PLACEHOLDERS = Array.from({ length: BATCH_SIZE }, () => '?').join(', ')

export class WaPreKeyMysqlStore extends BaseMysqlStore implements WaPreKeyStore {
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

            await this.withTransaction(async (conn) => {
                await this.ensureMetaRow(conn)
                for (const record of generated) {
                    await conn.execute(
                        `INSERT IGNORE INTO ${this.t('signal_prekey')} (
                            session_id, key_id, pub_key, priv_key, uploaded
                        ) VALUES (?, ?, ?, ?, ?)`,
                        [
                            this.sessionId,
                            record.keyId,
                            record.keyPair.pubKey,
                            record.keyPair.privKey,
                            record.uploaded === true ? 1 : 0
                        ]
                    )
                }
                await conn.execute(
                    `UPDATE ${this.t('signal_meta')}
                     SET next_prekey_id = GREATEST(next_prekey_id, ?)
                     WHERE session_id = ?`,
                    [maxId + 1, this.sessionId]
                )
            })

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
                `UPDATE ${this.t('signal_meta')}
                 SET server_has_prekeys = 0, next_prekey_id = 1
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
}
