import {
    decodeSignalPreKeyRow,
    type KyberPreKeyRecord,
    type PreKeyRecord,
    type SignalMetaRow,
    type SignalPreKeyRow
} from 'zapo-js/signal'
import type { WaPqPreKeyStore, WaPreKeyStore as WaPreKeyStoreContract } from 'zapo-js/store'
import { asBytes, asNumber, resolvePositive, toBoolOrUndef } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteConnection } from './connection'
import { repeatSqlToken } from './sql-utils'
import type { WaSqliteStorageOptions } from './types'

const DEFAULTS = Object.freeze({
    preKeyBatchSize: 500
} as const)

interface WaPreKeySqliteStoreOptions {
    readonly preKeyBatchSize?: number
}

/** Kyber pre-key ids are 3 bytes on the wire; the id counter wraps just before 2^24. */
const KYBER_PREKEY_ID_BORDER = 16_777_215

interface KyberPreKeyRow extends Record<string, unknown> {
    readonly key_id: unknown
    readonly pub_key: unknown
    readonly priv_key: unknown
    readonly signature: unknown
    readonly last_resort: unknown
}

function decodeKyberPreKeyRow(row: KyberPreKeyRow): KyberPreKeyRecord {
    return {
        keyId: asNumber(row.key_id, 'signal_kyber_prekey.key_id'),
        keyPair: {
            pubKey: asBytes(row.pub_key, 'signal_kyber_prekey.pub_key'),
            privKey: asBytes(row.priv_key, 'signal_kyber_prekey.priv_key')
        },
        signature: asBytes(row.signature, 'signal_kyber_prekey.signature'),
        lastResort: toBoolOrUndef(row.last_resort)
    }
}

export class WaPreKeySqliteStore
    extends BaseSqliteStore
    implements WaPreKeyStoreContract, WaPqPreKeyStore
{
    private readonly preKeyBatchSize: number

    public constructor(
        options: WaSqliteStorageOptions,
        storeOptions: WaPreKeySqliteStoreOptions = {}
    ) {
        super(options, ['signal'])
        this.preKeyBatchSize = resolvePositive(
            storeOptions.preKeyBatchSize,
            DEFAULTS.preKeyBatchSize,
            'signal.sqlite.preKeyBatchSize'
        )
    }

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        const db = await this.getConnection()
        this.ensureMetaRow(db)
        this.upsertPreKey(db, record)
        db.run(
            `UPDATE signal_meta
             SET next_prekey_id = MAX(next_prekey_id, ?)
             WHERE session_id = ?`,
            [record.keyId + 1, this.options.sessionId]
        )
    }

    public async getOrGenPreKeys(
        count: number,
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<readonly PreKeyRecord[]> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid prekey count: ${count}`)
        }
        while (true) {
            const reservation = await this.withTransaction((db) => {
                this.ensureMetaRow(db)
                const available = this.selectAvailablePreKeys(db, count)
                const missing = count - available.length
                if (missing <= 0) {
                    return {
                        available,
                        reservedKeyIds: [] as readonly number[]
                    }
                }
                const nextPreKeyId = this.getMeta(db).nextPreKeyId
                const reservedKeyIds = new Array<number>(missing)
                for (let index = 0; index < missing; index += 1) {
                    reservedKeyIds[index] = nextPreKeyId + index
                }
                db.run(
                    `UPDATE signal_meta
                     SET next_prekey_id = MAX(next_prekey_id, ?)
                     WHERE session_id = ?`,
                    [nextPreKeyId + missing, this.options.sessionId]
                )
                return {
                    available,
                    reservedKeyIds
                }
            })

            if (reservation.reservedKeyIds.length === 0) {
                return reservation.available
            }

            const generated = new Array<PreKeyRecord>(reservation.reservedKeyIds.length)
            let maxGeneratedKeyId =
                reservation.reservedKeyIds[reservation.reservedKeyIds.length - 1]
            for (let index = 0; index < reservation.reservedKeyIds.length; index += 1) {
                const requestedKeyId = reservation.reservedKeyIds[index]
                const generatedRecord = await generator(requestedKeyId)
                generated[index] = generatedRecord
                if (generatedRecord.keyId > maxGeneratedKeyId) {
                    maxGeneratedKeyId = generatedRecord.keyId
                }
            }

            const insertedCount = await this.withTransaction((db) => {
                this.ensureMetaRow(db)
                const before = this.countPreKeys(db)
                for (const record of generated) {
                    this.insertPreKeyIfMissing(db, record)
                }
                db.run(
                    `UPDATE signal_meta
                     SET next_prekey_id = MAX(next_prekey_id, ?)
                     WHERE session_id = ?`,
                    [maxGeneratedKeyId + 1, this.options.sessionId]
                )
                return this.countPreKeys(db) - before
            })

            // No new rows: the generator returned already-stored key ids (insert
            // no-op). Bail instead of looping; robust to a concurrent consume.
            if (insertedCount === 0) {
                throw new Error(
                    'getOrGenPreKeys made no progress; the generator returned key ids ' +
                        'that collide with stored prekeys'
                )
            }

            const available = await this.withTransaction((db) =>
                this.selectAvailablePreKeys(db, count)
            )
            if (available.length >= count) {
                return available
            }
        }
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        const db = await this.getConnection()
        const row = db.get<SignalPreKeyRow>(
            `SELECT key_id, pub_key, priv_key, uploaded
             FROM signal_prekey
             WHERE session_id = ? AND key_id = ?`,
            [this.options.sessionId, keyId]
        )
        return row ? decodeSignalPreKeyRow(row) : null
    }

    public async getPreKeysById(
        keyIds: readonly number[]
    ): Promise<readonly (PreKeyRecord | null)[]> {
        if (keyIds.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const uniqueKeyIds = [...new Set(keyIds)]
        const byId = new Map<number, PreKeyRecord>()
        for (let start = 0; start < uniqueKeyIds.length; start += this.preKeyBatchSize) {
            const end = Math.min(start + this.preKeyBatchSize, uniqueKeyIds.length)
            const batchLength = end - start
            const placeholders = repeatSqlToken('?', batchLength, ', ')
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                params.push(uniqueKeyIds[index])
            }
            const rows = db.all<SignalPreKeyRow>(
                `SELECT key_id, pub_key, priv_key, uploaded
                 FROM signal_prekey
                 WHERE session_id = ? AND key_id IN (${placeholders})`,
                params
            )
            for (const row of rows) {
                const record = decodeSignalPreKeyRow(row)
                byId.set(record.keyId, record)
            }
        }
        const records = new Array<PreKeyRecord | null>(keyIds.length)
        for (let index = 0; index < keyIds.length; index += 1) {
            records[index] = byId.get(keyIds[index]) ?? null
        }
        return records
    }

    public async consumePreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        return this.withTransaction((db) => {
            const row = db.get<SignalPreKeyRow>(
                `SELECT key_id, pub_key, priv_key, uploaded
                 FROM signal_prekey
                 WHERE session_id = ? AND key_id = ?`,
                [this.options.sessionId, keyId]
            )
            if (!row) {
                return null
            }
            db.run(
                `DELETE FROM signal_prekey
                 WHERE session_id = ? AND key_id = ?`,
                [this.options.sessionId, keyId]
            )
            return decodeSignalPreKeyRow(row)
        })
    }

    public async getOrGenSinglePreKey(
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<PreKeyRecord> {
        const records = await this.getOrGenPreKeys(1, generator)
        return records[0]
    }

    public async markKeyAsUploaded(keyId: number): Promise<void> {
        const db = await this.getConnection()
        const meta = this.getMeta(db)
        if (keyId < 0 || keyId >= meta.nextPreKeyId) {
            throw new Error(`prekey ${keyId} is out of boundary`)
        }
        db.run(
            `UPDATE signal_prekey
             SET uploaded = 1
             WHERE session_id = ? AND key_id <= ?`,
            [this.options.sessionId, keyId]
        )
    }

    public async setServerHasPreKeys(value: boolean): Promise<void> {
        const db = await this.getConnection()
        this.ensureMetaRow(db)
        db.run(
            `UPDATE signal_meta
             SET server_has_prekeys = ?
             WHERE session_id = ?`,
            [value ? 1 : 0, this.options.sessionId]
        )
    }

    public async getServerHasPreKeys(): Promise<boolean> {
        const db = await this.getConnection()
        const meta = this.getMeta(db)
        return meta.serverHasPreKeys
    }

    public async putKyberPreKeys(records: readonly KyberPreKeyRecord[]): Promise<void> {
        if (records.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (const record of records) {
                db.run(
                    `INSERT INTO signal_kyber_prekey (
                        session_id,
                        key_id,
                        pub_key,
                        priv_key,
                        signature,
                        last_resort
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id, key_id) DO UPDATE SET
                        pub_key=excluded.pub_key,
                        priv_key=excluded.priv_key,
                        signature=excluded.signature,
                        last_resort=excluded.last_resort`,
                    [
                        this.options.sessionId,
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
        const db = await this.getConnection()
        const row = db.get<KyberPreKeyRow>(
            `SELECT key_id, pub_key, priv_key, signature, last_resort
             FROM signal_kyber_prekey
             WHERE session_id = ? AND key_id = ?`,
            [this.options.sessionId, keyId]
        )
        return row ? decodeKyberPreKeyRow(row) : null
    }

    public async consumeKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        return this.withTransaction((db) => {
            const row = db.get<KyberPreKeyRow>(
                `SELECT key_id, pub_key, priv_key, signature, last_resort
                 FROM signal_kyber_prekey
                 WHERE session_id = ? AND key_id = ?`,
                [this.options.sessionId, keyId]
            )
            if (!row) {
                return null
            }
            const record = decodeKyberPreKeyRow(row)
            if (record.lastResort !== true) {
                db.run(`DELETE FROM signal_kyber_prekey WHERE session_id = ? AND key_id = ?`, [
                    this.options.sessionId,
                    keyId
                ])
            }
            return record
        })
    }

    public async removeKyberPreKeys(keyIds: readonly number[]): Promise<void> {
        if (keyIds.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (let index = 0; index < keyIds.length; index += 1) {
                db.run(`DELETE FROM signal_kyber_prekey WHERE session_id = ? AND key_id = ?`, [
                    this.options.sessionId,
                    keyIds[index]
                ])
            }
        })
    }

    public async getLatestKyberLastResortKey(): Promise<KyberPreKeyRecord | null> {
        const db = await this.getConnection()
        const row = db.get<KyberPreKeyRow>(
            `SELECT key_id, pub_key, priv_key, signature, last_resort
             FROM signal_kyber_prekey
             WHERE session_id = ? AND last_resort = 1
             ORDER BY key_id DESC
             LIMIT 1`,
            [this.options.sessionId]
        )
        return row ? decodeKyberPreKeyRow(row) : null
    }

    public async reserveKyberPreKeyIds(count: number): Promise<number> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid kyber prekey count: ${count}`)
        }
        return this.withTransaction((db) => {
            this.ensureMetaRow(db)
            const row = db.get<{ next_kyber_prekey_id: unknown }>(
                `SELECT next_kyber_prekey_id FROM signal_meta WHERE session_id = ?`,
                [this.options.sessionId]
            )
            const first = asNumber(row!.next_kyber_prekey_id, 'signal_meta.next_kyber_prekey_id')
            db.run(`UPDATE signal_meta SET next_kyber_prekey_id = ? WHERE session_id = ?`, [
                (first + count) % KYBER_PREKEY_ID_BORDER,
                this.options.sessionId
            ])
            return first
        })
    }

    public async getPqMigrated(): Promise<boolean> {
        const db = await this.getConnection()
        this.ensureMetaRow(db)
        const row = db.get<{ pq_migrated: unknown }>(
            `SELECT pq_migrated FROM signal_meta WHERE session_id = ?`,
            [this.options.sessionId]
        )
        return toBoolOrUndef(row!.pq_migrated) === true
    }

    public async setPqMigrated(value: boolean): Promise<void> {
        const db = await this.getConnection()
        this.ensureMetaRow(db)
        db.run(`UPDATE signal_meta SET pq_migrated = ? WHERE session_id = ?`, [
            value ? 1 : 0,
            this.options.sessionId
        ])
    }

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM signal_prekey WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM signal_kyber_prekey WHERE session_id = ?', [this.options.sessionId])
            db.run(
                `UPDATE signal_meta
                 SET server_has_prekeys = 0,
                     next_prekey_id = 1,
                     next_kyber_prekey_id = 1,
                     pq_migrated = 0
                 WHERE session_id = ?`,
                [this.options.sessionId]
            )
        })
    }

    private selectAvailablePreKeys(db: WaSqliteConnection, limit: number): readonly PreKeyRecord[] {
        const rows = db.all<SignalPreKeyRow>(
            `SELECT key_id, pub_key, priv_key, uploaded
             FROM signal_prekey
             WHERE session_id = ? AND uploaded = 0
             ORDER BY key_id ASC
             LIMIT ?`,
            [this.options.sessionId, limit]
        )
        const records = new Array<PreKeyRecord>(rows.length)
        for (let index = 0; index < rows.length; index += 1) {
            records[index] = decodeSignalPreKeyRow(rows[index])
        }
        return records
    }

    private countPreKeys(db: WaSqliteConnection): number {
        const row = db.get<{ count: number }>(
            `SELECT COUNT(*) AS count FROM signal_prekey WHERE session_id = ?`,
            [this.options.sessionId]
        )
        return row?.count ?? 0
    }

    private upsertPreKey(db: WaSqliteConnection, record: PreKeyRecord): void {
        db.run(
            `INSERT INTO signal_prekey (
                session_id,
                key_id,
                pub_key,
                priv_key,
                uploaded
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, key_id) DO UPDATE SET
                pub_key=excluded.pub_key,
                priv_key=excluded.priv_key,
                uploaded=excluded.uploaded`,
            [
                this.options.sessionId,
                record.keyId,
                record.keyPair.pubKey,
                record.keyPair.privKey,
                record.uploaded === true ? 1 : 0
            ]
        )
    }

    private insertPreKeyIfMissing(db: WaSqliteConnection, record: PreKeyRecord): void {
        db.run(
            `INSERT INTO signal_prekey (
                session_id,
                key_id,
                pub_key,
                priv_key,
                uploaded
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, key_id) DO NOTHING`,
            [
                this.options.sessionId,
                record.keyId,
                record.keyPair.pubKey,
                record.keyPair.privKey,
                record.uploaded === true ? 1 : 0
            ]
        )
    }

    private ensureMetaRow(db: WaSqliteConnection): void {
        db.run(
            `INSERT INTO signal_meta (
                session_id,
                server_has_prekeys,
                next_prekey_id
            ) VALUES (?, 0, 1)
            ON CONFLICT(session_id) DO NOTHING`,
            [this.options.sessionId]
        )
    }

    private getMeta(db: WaSqliteConnection): {
        serverHasPreKeys: boolean
        nextPreKeyId: number
    } {
        this.ensureMetaRow(db)
        const row = db.get<SignalMetaRow>(
            `SELECT server_has_prekeys, next_prekey_id
             FROM signal_meta
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        return {
            serverHasPreKeys: toBoolOrUndef(row!.server_has_prekeys) === true,
            nextPreKeyId: asNumber(row!.next_prekey_id, 'signal_meta.next_prekey_id')
        }
    }
}
