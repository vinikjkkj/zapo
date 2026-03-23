import { signalAddressKey } from '@protocol/jid'
import {
    decodeSignalPreKeyRow,
    decodeSignalRegistrationRow,
    decodeSignalRemoteIdentity,
    decodeSignalSessionRecord,
    decodeSignalSignedPreKeyRow,
    encodeSignalSessionRecord,
    toSignalAddressParts,
    type SignalIdentityRow,
    type SignalMetaRow,
    type SignalPreKeyRow,
    type SignalRegistrationRow,
    type SignalSessionRow,
    type SignalSignedPreKeyRow
} from '@signal/store/sqlite'
import type {
    PreKeyRecord,
    RegistrationInfo,
    SignalAddress,
    SignalSessionRecord,
    SignedPreKeyRecord
} from '@signal/types'
import type {
    WaSignalMetaSnapshot,
    WaSignalStore as WaSignalStoreContract
} from '@store/contracts/signal.store'
import { BaseSqliteStore } from '@store/providers/sqlite/BaseSqliteStore'
import type { WaSqliteConnection } from '@store/providers/sqlite/connection'
import { repeatSqlToken } from '@store/providers/sqlite/sql-utils'
import type { WaSqliteStorageOptions } from '@store/types'
import {
    asNumber,
    asOptionalBytes,
    asOptionalNumber,
    asString,
    toBoolOrUndef,
    resolvePositive
} from '@util/coercion'

interface SignalSessionExistsRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
}

interface SignalSessionBatchRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
    readonly record: unknown
}

interface SignalIdentityBatchRow extends Record<string, unknown> {
    readonly user: unknown
    readonly server: unknown
    readonly device: unknown
    readonly identity_key: unknown
}

interface SignalMetaSnapshotRow extends Record<string, unknown> {
    readonly server_has_prekeys: unknown
    readonly signed_prekey_rotation_ts: unknown
    readonly registration_id: unknown
    readonly identity_pub_key: unknown
    readonly identity_priv_key: unknown
    readonly signed_key_id: unknown
    readonly signed_pub_key: unknown
    readonly signed_priv_key: unknown
    readonly signed_signature: unknown
    readonly signed_uploaded: unknown
}

const DEFAULTS = Object.freeze({
    preKeyBatchSize: 500,
    hasSessionBatchSize: 250
} as const)

interface WaSignalSqliteStoreOptions {
    readonly preKeyBatchSize?: number
    readonly hasSessionBatchSize?: number
}

export class WaSignalSqliteStore extends BaseSqliteStore implements WaSignalStoreContract {
    private readonly preKeyBatchSize: number
    private readonly hasSessionBatchSize: number

    public constructor(
        options: WaSqliteStorageOptions,
        storeOptions: WaSignalSqliteStoreOptions = {}
    ) {
        super(options, ['signal'])
        this.preKeyBatchSize = resolvePositive(
            storeOptions.preKeyBatchSize,
            DEFAULTS.preKeyBatchSize,
            'signal.sqlite.preKeyBatchSize'
        )
        this.hasSessionBatchSize = resolvePositive(
            storeOptions.hasSessionBatchSize,
            DEFAULTS.hasSessionBatchSize,
            'signal.sqlite.hasSessionBatchSize'
        )
    }

    public async getRegistrationInfo(): Promise<RegistrationInfo | null> {
        const db = await this.getConnection()
        const row = db.get<SignalRegistrationRow>(
            `SELECT registration_id, identity_pub_key, identity_priv_key
             FROM signal_registration
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        return row ? decodeSignalRegistrationRow(row) : null
    }

    public async setRegistrationInfo(info: RegistrationInfo): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO signal_registration (
                session_id,
                registration_id,
                identity_pub_key,
                identity_priv_key
            ) VALUES (?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                registration_id=excluded.registration_id,
                identity_pub_key=excluded.identity_pub_key,
                identity_priv_key=excluded.identity_priv_key`,
            [
                this.options.sessionId,
                info.registrationId,
                info.identityKeyPair.pubKey,
                info.identityKeyPair.privKey
            ]
        )
    }

    public async getSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        const db = await this.getConnection()
        const row = db.get<SignalSignedPreKeyRow>(
            `SELECT key_id, pub_key, priv_key, signature, uploaded
             FROM signal_signed_prekey
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        return row ? decodeSignalSignedPreKeyRow(row) : null
    }

    public async setSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
        const db = await this.getConnection()
        db.run(
            `INSERT INTO signal_signed_prekey (
                session_id,
                key_id,
                pub_key,
                priv_key,
                signature,
                uploaded
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(session_id) DO UPDATE SET
                key_id=excluded.key_id,
                pub_key=excluded.pub_key,
                priv_key=excluded.priv_key,
                signature=excluded.signature,
                uploaded=excluded.uploaded`,
            [
                this.options.sessionId,
                record.keyId,
                record.keyPair.pubKey,
                record.keyPair.privKey,
                record.signature,
                record.uploaded === true ? 1 : 0
            ]
        )
    }

    public async getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null> {
        const db = await this.getConnection()
        const row = db.get<SignalSignedPreKeyRow>(
            `SELECT key_id, pub_key, priv_key, signature, uploaded
             FROM signal_signed_prekey
             WHERE session_id = ? AND key_id = ?`,
            [this.options.sessionId, keyId]
        )
        return row ? decodeSignalSignedPreKeyRow(row) : null
    }

    public async setSignedPreKeyRotationTs(value: number | null): Promise<void> {
        const db = await this.getConnection()
        this.ensureMetaRow(db)
        db.run(
            `UPDATE signal_meta
             SET signed_prekey_rotation_ts = ?
             WHERE session_id = ?`,
            [value, this.options.sessionId]
        )
    }

    public async getSignedPreKeyRotationTs(): Promise<number | null> {
        const db = await this.getConnection()
        const meta = this.getMeta(db)
        return meta.signedPreKeyRotationTs
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
        return keyIds.map((keyId) => byId.get(keyId) ?? null)
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

    public async getSignalMeta(): Promise<WaSignalMetaSnapshot> {
        const db = await this.getConnection()
        this.ensureMetaRow(db)
        const row = db.get<SignalMetaSnapshotRow>(
            `SELECT
                m.server_has_prekeys AS server_has_prekeys,
                m.signed_prekey_rotation_ts AS signed_prekey_rotation_ts,
                r.registration_id AS registration_id,
                r.identity_pub_key AS identity_pub_key,
                r.identity_priv_key AS identity_priv_key,
                s.key_id AS signed_key_id,
                s.pub_key AS signed_pub_key,
                s.priv_key AS signed_priv_key,
                s.signature AS signed_signature,
                s.uploaded AS signed_uploaded
             FROM signal_meta AS m
             LEFT JOIN signal_registration AS r
                ON r.session_id = m.session_id
             LEFT JOIN signal_signed_prekey AS s
                ON s.session_id = m.session_id
             WHERE m.session_id = ?`,
            [this.options.sessionId]
        )
        if (!row) {
            throw new Error('signal meta row not found')
        }

        const registrationId = asOptionalNumber(
            row.registration_id,
            'signal_registration.registration_id'
        )
        const registrationPubKey = asOptionalBytes(
            row.identity_pub_key,
            'signal_registration.identity_pub_key'
        )
        const registrationPrivKey = asOptionalBytes(
            row.identity_priv_key,
            'signal_registration.identity_priv_key'
        )
        const registrationInfo =
            registrationId !== undefined && registrationPubKey && registrationPrivKey
                ? decodeSignalRegistrationRow({
                      registration_id: row.registration_id,
                      identity_pub_key: row.identity_pub_key,
                      identity_priv_key: row.identity_priv_key
                  })
                : null
        const signedKeyId = asOptionalNumber(row.signed_key_id, 'signal_signed_prekey.key_id')
        const signedPubKey = asOptionalBytes(row.signed_pub_key, 'signal_signed_prekey.pub_key')
        const signedPrivKey = asOptionalBytes(row.signed_priv_key, 'signal_signed_prekey.priv_key')
        const signedSignature = asOptionalBytes(
            row.signed_signature,
            'signal_signed_prekey.signature'
        )
        const signedPreKey =
            signedKeyId !== undefined && signedPubKey && signedPrivKey && signedSignature
                ? decodeSignalSignedPreKeyRow({
                      key_id: row.signed_key_id,
                      pub_key: row.signed_pub_key,
                      priv_key: row.signed_priv_key,
                      signature: row.signed_signature,
                      uploaded: row.signed_uploaded
                  })
                : null

        return {
            serverHasPreKeys: toBoolOrUndef(row.server_has_prekeys) === true,
            signedPreKeyRotationTs:
                asOptionalNumber(
                    row.signed_prekey_rotation_ts,
                    'signal_meta.signed_prekey_rotation_ts'
                ) ?? null,
            registrationInfo,
            signedPreKey
        }
    }

    public async hasSession(address: SignalAddress): Promise<boolean> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        return (
            db.get<Record<string, unknown>>(
                `SELECT 1 AS has_session
                 FROM signal_session
                 WHERE session_id = ? AND user = ? AND server = ? AND device = ?
                 LIMIT 1`,
                [this.options.sessionId, target.user, target.server, target.device]
            ) !== null
        )
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        if (addresses.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const targets = addresses.map((address) => toSignalAddressParts(address))
        const existingKeys = new Set<string>()
        for (let start = 0; start < targets.length; start += this.hasSessionBatchSize) {
            const end = Math.min(start + this.hasSessionBatchSize, targets.length)
            const batchLength = end - start
            const filters = repeatSqlToken(
                '(user = ? AND server = ? AND device = ?)',
                batchLength,
                ' OR '
            )
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                const target = targets[index]
                params.push(target.user, target.server, target.device)
            }
            const rows = db.all<SignalSessionExistsRow>(
                `SELECT user, server, device
                 FROM signal_session
                 WHERE session_id = ? AND (${filters})`,
                params
            )
            for (const row of rows) {
                existingKeys.add(
                    signalAddressKey({
                        user: asString(row.user, 'signal_session.user'),
                        server: asString(row.server, 'signal_session.server'),
                        device: asNumber(row.device, 'signal_session.device')
                    })
                )
            }
        }
        return targets.map((target) => existingKeys.has(signalAddressKey(target)))
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        const row = db.get<SignalSessionRow>(
            `SELECT user, server, device, record
             FROM signal_session
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.options.sessionId, target.user, target.server, target.device]
        )
        return row ? decodeSignalSessionRecord(row.record) : null
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        if (addresses.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const targets = addresses.map((address) => toSignalAddressParts(address))
        const byAddressKey = new Map<string, SignalSessionRecord>()
        for (let start = 0; start < targets.length; start += this.hasSessionBatchSize) {
            const end = Math.min(start + this.hasSessionBatchSize, targets.length)
            const batchLength = end - start
            const filters = repeatSqlToken(
                '(user = ? AND server = ? AND device = ?)',
                batchLength,
                ' OR '
            )
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                const target = targets[index]
                params.push(target.user, target.server, target.device)
            }
            const rows = db.all<SignalSessionBatchRow>(
                `SELECT user, server, device, record
                 FROM signal_session
                 WHERE session_id = ? AND (${filters})`,
                params
            )
            for (const row of rows) {
                byAddressKey.set(
                    signalAddressKey({
                        user: asString(row.user, 'signal_session.user'),
                        server: asString(row.server, 'signal_session.server'),
                        device: asNumber(row.device, 'signal_session.device')
                    }),
                    decodeSignalSessionRecord(row.record)
                )
            }
        }
        return targets.map((target) => byAddressKey.get(signalAddressKey(target)) ?? null)
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        this.upsertSession(db, target, session)
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        if (entries.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (let index = 0; index < entries.length; index += 1) {
                const entry = entries[index]
                this.upsertSession(db, toSignalAddressParts(entry.address), entry.session)
            }
        })
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        db.run(
            `DELETE FROM signal_session
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.options.sessionId, target.user, target.server, target.device]
        )
    }

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        const row = db.get<SignalIdentityRow>(
            `SELECT identity_key
             FROM signal_identity
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.options.sessionId, target.user, target.server, target.device]
        )
        return row ? decodeSignalRemoteIdentity(row.identity_key) : null
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const targets = addresses.map((address) => toSignalAddressParts(address))
        const byAddressKey = new Map<string, Uint8Array>()
        for (let start = 0; start < targets.length; start += this.hasSessionBatchSize) {
            const end = Math.min(start + this.hasSessionBatchSize, targets.length)
            const batchLength = end - start
            const filters = repeatSqlToken(
                '(user = ? AND server = ? AND device = ?)',
                batchLength,
                ' OR '
            )
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                const target = targets[index]
                params.push(target.user, target.server, target.device)
            }
            const rows = db.all<SignalIdentityBatchRow>(
                `SELECT user, server, device, identity_key
                 FROM signal_identity
                 WHERE session_id = ? AND (${filters})`,
                params
            )
            for (const row of rows) {
                byAddressKey.set(
                    signalAddressKey({
                        user: asString(row.user, 'signal_identity.user'),
                        server: asString(row.server, 'signal_identity.server'),
                        device: asNumber(row.device, 'signal_identity.device')
                    }),
                    decodeSignalRemoteIdentity(row.identity_key)
                )
            }
        }
        return targets.map((target) => byAddressKey.get(signalAddressKey(target)) ?? null)
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        const db = await this.getConnection()
        const target = toSignalAddressParts(address)
        this.upsertRemoteIdentity(db, target, identityKey)
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                this.upsertRemoteIdentity(db, target, entry.identityKey)
            }
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM signal_registration WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM signal_signed_prekey WHERE session_id = ?', [
                this.options.sessionId
            ])
            db.run('DELETE FROM signal_prekey WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM signal_session WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM signal_identity WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM signal_meta WHERE session_id = ?', [this.options.sessionId])
        })
    }

    private selectAvailablePreKeys(db: WaSqliteConnection, limit: number): readonly PreKeyRecord[] {
        return db
            .all<SignalPreKeyRow>(
                `SELECT key_id, pub_key, priv_key, uploaded
                 FROM signal_prekey
                 WHERE session_id = ? AND uploaded = 0
                 ORDER BY key_id ASC
                 LIMIT ?`,
                [this.options.sessionId, limit]
            )
            .map((row) => decodeSignalPreKeyRow(row))
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

    private upsertSession(
        db: WaSqliteConnection,
        target: ReturnType<typeof toSignalAddressParts>,
        session: SignalSessionRecord
    ): void {
        db.run(
            `INSERT INTO signal_session (
                session_id,
                user,
                server,
                device,
                record
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, user, server, device) DO UPDATE SET
                record=excluded.record`,
            [
                this.options.sessionId,
                target.user,
                target.server,
                target.device,
                encodeSignalSessionRecord(session)
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
        signedPreKeyRotationTs: number | null
    } {
        this.ensureMetaRow(db)
        const row = db.get<SignalMetaRow>(
            `SELECT server_has_prekeys, next_prekey_id, signed_prekey_rotation_ts
             FROM signal_meta
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        return {
            serverHasPreKeys: toBoolOrUndef(row!.server_has_prekeys) === true,
            nextPreKeyId: asNumber(row!.next_prekey_id, 'signal_meta.next_prekey_id'),
            signedPreKeyRotationTs:
                asOptionalNumber(
                    row!.signed_prekey_rotation_ts,
                    'signal_meta.signed_prekey_rotation_ts'
                ) ?? null
        }
    }

    private upsertRemoteIdentity(
        db: WaSqliteConnection,
        target: ReturnType<typeof toSignalAddressParts>,
        identityKey: Uint8Array
    ): void {
        db.run(
            `INSERT INTO signal_identity (
                session_id,
                user,
                server,
                device,
                identity_key
            ) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(session_id, user, server, device) DO UPDATE SET
                identity_key=excluded.identity_key`,
            [this.options.sessionId, target.user, target.server, target.device, identityKey]
        )
    }
}
