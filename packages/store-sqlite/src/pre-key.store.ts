import type { SignalMetaRow, SignalPreKeyRow, PreKeyRecord } from 'zapo-js/signal'
import { decodeSignalPreKeyRow } from 'zapo-js/signal'
import type { WaPreKeyStore as WaPreKeyStoreContract } from 'zapo-js/store'
import { asNumber, resolvePositive, toBoolOrUndef } from 'zapo-js/util'

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

export class WaPreKeySqliteStore extends BaseSqliteStore implements WaPreKeyStoreContract {
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

            await this.withTransaction((db) => {
                this.ensureMetaRow(db)
                for (const record of generated) {
                    this.insertPreKeyIfMissing(db, record)
                }
                db.run(
                    `UPDATE signal_meta
                     SET next_prekey_id = MAX(next_prekey_id, ?)
                     WHERE session_id = ?`,
                    [maxGeneratedKeyId + 1, this.options.sessionId]
                )
            })

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

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM signal_prekey WHERE session_id = ?', [this.options.sessionId])
            db.run(
                `UPDATE signal_meta
                 SET server_has_prekeys = 0, next_prekey_id = 1
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
