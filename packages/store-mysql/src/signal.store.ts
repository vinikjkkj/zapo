import type { PoolConnection } from 'mysql2/promise'
import { signalAddressKey } from 'zapo-js/protocol'
import type {
    PreKeyRecord,
    RegistrationInfo,
    SignalAddress,
    SignalSessionRecord,
    SignedPreKeyRecord
} from 'zapo-js/signal'
import {
    encodeSignalSessionRecord,
    decodeSignalSessionRecord,
    toSignalAddressParts,
    type SignalAddressParts
} from 'zapo-js/signal'
import type { WaSignalStore, WaSignalMetaSnapshot } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst, queryRows, safeLimit, toBytes, toBytesOrNull, type MysqlRow } from './helpers'
import type { MysqlParam, WaMysqlStorageOptions } from './types'

const BATCH_SIZE = 250

export class WaSignalMysqlStore extends BaseMysqlStore implements WaSignalStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['signal'])
    }

    // ── Registration ──────────────────────────────────────────────────

    public async getRegistrationInfo(): Promise<RegistrationInfo | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT registration_id, identity_pub_key, identity_priv_key
             FROM ${this.t('signal_registration')}
             WHERE session_id = ?`,
                [this.sessionId]
            )
        )
        if (!row) return null
        return {
            registrationId: Number(row.registration_id),
            identityKeyPair: {
                pubKey: toBytes(row.identity_pub_key),
                privKey: toBytes(row.identity_priv_key)
            }
        }
    }

    public async setRegistrationInfo(info: RegistrationInfo): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('signal_registration')} (
                session_id, registration_id, identity_pub_key, identity_priv_key
            ) VALUES (?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                registration_id = VALUES(registration_id),
                identity_pub_key = VALUES(identity_pub_key),
                identity_priv_key = VALUES(identity_priv_key)`,
            [
                this.sessionId,
                info.registrationId,
                info.identityKeyPair.pubKey,
                info.identityKeyPair.privKey
            ]
        )
    }

    // ── Signed PreKey ─────────────────────────────────────────────────

    public async getSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT key_id, pub_key, priv_key, signature, uploaded
             FROM ${this.t('signal_signed_prekey')}
             WHERE session_id = ?`,
                [this.sessionId]
            )
        )
        if (!row) return null
        return this.decodeSignedPreKeyRow(row)
    }

    public async setSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('signal_signed_prekey')} (
                session_id, key_id, pub_key, priv_key, signature, uploaded
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                key_id = VALUES(key_id),
                pub_key = VALUES(pub_key),
                priv_key = VALUES(priv_key),
                signature = VALUES(signature),
                uploaded = VALUES(uploaded)`,
            [
                this.sessionId,
                record.keyId,
                record.keyPair.pubKey,
                record.keyPair.privKey,
                record.signature,
                record.uploaded === true ? 1 : 0
            ]
        )
    }

    public async getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT key_id, pub_key, priv_key, signature, uploaded
             FROM ${this.t('signal_signed_prekey')}
             WHERE session_id = ? AND key_id = ?`,
                [this.sessionId, keyId]
            )
        )
        if (!row) return null
        return this.decodeSignedPreKeyRow(row)
    }

    public async setSignedPreKeyRotationTs(value: number | null): Promise<void> {
        await this.withTransaction(async (conn) => {
            await this.ensureMetaRow(conn)
            await conn.execute(
                `UPDATE ${this.t('signal_meta')}
                 SET signed_prekey_rotation_ts = ?
                 WHERE session_id = ?`,
                [value, this.sessionId]
            )
        })
    }

    public async getSignedPreKeyRotationTs(): Promise<number | null> {
        const meta = await this.withTransaction(async (conn) => this.getMeta(conn))
        return meta.signedPreKeyRotationTs
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
            const placeholders = batch.map(() => '?').join(', ')
            const params: MysqlParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT key_id, pub_key, priv_key, uploaded
                 FROM ${this.t('signal_prekey')}
                 WHERE session_id = ? AND key_id IN (${placeholders})`,
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

    // ── Meta ──────────────────────────────────────────────────────────

    public async getSignalMeta(): Promise<WaSignalMetaSnapshot> {
        return this.withTransaction(async (conn) => {
            await this.ensureMetaRow(conn)
            const row = queryFirst(
                await conn.execute(
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
                 FROM ${this.t('signal_meta')} AS m
                 LEFT JOIN ${this.t('signal_registration')} AS r
                    ON r.session_id = m.session_id
                 LEFT JOIN ${this.t('signal_signed_prekey')} AS s
                    ON s.session_id = m.session_id
                 WHERE m.session_id = ?`,
                    [this.sessionId]
                )
            )
            if (!row) {
                throw new Error('signal meta row not found')
            }

            const registrationId =
                row.registration_id !== null ? Number(row.registration_id) : undefined
            const registrationPubKey = toBytesOrNull(row.identity_pub_key)
            const registrationPrivKey = toBytesOrNull(row.identity_priv_key)
            const registrationInfo: RegistrationInfo | null =
                registrationId !== undefined && registrationPubKey && registrationPrivKey
                    ? {
                          registrationId,
                          identityKeyPair: {
                              pubKey: registrationPubKey,
                              privKey: registrationPrivKey
                          }
                      }
                    : null

            const signedKeyId = row.signed_key_id !== null ? Number(row.signed_key_id) : undefined
            const signedPubKey = toBytesOrNull(row.signed_pub_key)
            const signedPrivKey = toBytesOrNull(row.signed_priv_key)
            const signedSignature = toBytesOrNull(row.signed_signature)
            const signedPreKey: SignedPreKeyRecord | null =
                signedKeyId !== undefined && signedPubKey && signedPrivKey && signedSignature
                    ? {
                          keyId: signedKeyId,
                          keyPair: { pubKey: signedPubKey, privKey: signedPrivKey },
                          signature: signedSignature,
                          uploaded:
                              row.signed_uploaded !== null
                                  ? Number(row.signed_uploaded) === 1
                                  : undefined
                      }
                    : null

            return {
                serverHasPreKeys: Number(row.server_has_prekeys) === 1,
                signedPreKeyRotationTs:
                    row.signed_prekey_rotation_ts !== null
                        ? Number(row.signed_prekey_rotation_ts)
                        : null,
                registrationInfo,
                signedPreKey
            }
        })
    }

    // ── Sessions ──────────────────────────────────────────────────────

    public async hasSession(address: SignalAddress): Promise<boolean> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        return (
            queryRows(
                await this.pool.execute(
                    `SELECT 1 AS has_session
             FROM ${this.t('signal_session')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?
             LIMIT 1`,
                    [this.sessionId, target.user, target.server, target.device]
                )
            ).length > 0
        )
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        if (addresses.length === 0) return []
        await this.ensureReady()
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const existingKeys = new Set<string>()
        for (let start = 0; start < targets.length; start += BATCH_SIZE) {
            const batch = targets.slice(start, start + BATCH_SIZE)
            const placeholders = batch
                .map(() => '(user = ? AND server = ? AND device = ?)')
                .join(' OR ')
            const params: MysqlParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT user, server, device
                 FROM ${this.t('signal_session')}
                 WHERE session_id = ? AND (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                existingKeys.add(
                    signalAddressKey({
                        user: String(row.user),
                        server: String(row.server),
                        device: Number(row.device)
                    })
                )
            }
        }
        return targets.map((t) => existingKeys.has(signalAddressKey(t)))
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        const row = queryFirst(
            await this.pool.execute(
                `SELECT record
             FROM ${this.t('signal_session')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
                [this.sessionId, target.user, target.server, target.device]
            )
        )
        if (!row) return null
        return decodeSignalSessionRecord(toBytes(row.record))
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        if (addresses.length === 0) return []
        await this.ensureReady()
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const byKey = new Map<string, SignalSessionRecord>()
        for (let start = 0; start < targets.length; start += BATCH_SIZE) {
            const batch = targets.slice(start, start + BATCH_SIZE)
            const placeholders = batch
                .map(() => '(user = ? AND server = ? AND device = ?)')
                .join(' OR ')
            const params: MysqlParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT user, server, device, record
                 FROM ${this.t('signal_session')}
                 WHERE session_id = ? AND (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                byKey.set(
                    signalAddressKey({
                        user: String(row.user),
                        server: String(row.server),
                        device: Number(row.device)
                    }),
                    decodeSignalSessionRecord(toBytes(row.record))
                )
            }
        }
        return targets.map((t) => byKey.get(signalAddressKey(t)) ?? null)
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.upsertSession(this.pool, target, session)
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        await this.withTransaction(async (conn) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                await this.upsertSession(conn, target, entry.session)
            }
        })
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.pool.execute(
            `DELETE FROM ${this.t('signal_session')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
            [this.sessionId, target.user, target.server, target.device]
        )
    }

    // ── Identities ────────────────────────────────────────────────────

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        const row = queryFirst(
            await this.pool.execute(
                `SELECT identity_key
             FROM ${this.t('signal_identity')}
             WHERE session_id = ? AND user = ? AND server = ? AND device = ?`,
                [this.sessionId, target.user, target.server, target.device]
            )
        )
        if (!row) return null
        return toBytes(row.identity_key)
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) return []
        await this.ensureReady()
        const targets = addresses.map((a) => toSignalAddressParts(a))
        const byKey = new Map<string, Uint8Array>()
        for (let start = 0; start < targets.length; start += BATCH_SIZE) {
            const batch = targets.slice(start, start + BATCH_SIZE)
            const placeholders = batch
                .map(() => '(user = ? AND server = ? AND device = ?)')
                .join(' OR ')
            const params: MysqlParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT user, server, device, identity_key
                 FROM ${this.t('signal_identity')}
                 WHERE session_id = ? AND (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                byKey.set(
                    signalAddressKey({
                        user: String(row.user),
                        server: String(row.server),
                        device: Number(row.device)
                    }),
                    toBytes(row.identity_key)
                )
            }
        }
        return targets.map((t) => byKey.get(signalAddressKey(t)) ?? null)
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.upsertRemoteIdentity(this.pool, target, identityKey)
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        await this.withTransaction(async (conn) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                await this.upsertRemoteIdentity(conn, target, entry.identityKey)
            }
        })
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (conn) => {
            await conn.execute(
                `DELETE FROM ${this.t('signal_registration')} WHERE session_id = ?`,
                [this.sessionId]
            )
            await conn.execute(
                `DELETE FROM ${this.t('signal_signed_prekey')} WHERE session_id = ?`,
                [this.sessionId]
            )
            await conn.execute(`DELETE FROM ${this.t('signal_prekey')} WHERE session_id = ?`, [
                this.sessionId
            ])
            await conn.execute(`DELETE FROM ${this.t('signal_session')} WHERE session_id = ?`, [
                this.sessionId
            ])
            await conn.execute(`DELETE FROM ${this.t('signal_identity')} WHERE session_id = ?`, [
                this.sessionId
            ])
            await conn.execute(`DELETE FROM ${this.t('signal_meta')} WHERE session_id = ?`, [
                this.sessionId
            ])
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
        signedPreKeyRotationTs: number | null
    }> {
        await this.ensureMetaRow(conn)
        const row = queryFirst(
            await conn.execute(
                `SELECT server_has_prekeys, next_prekey_id, signed_prekey_rotation_ts
             FROM ${this.t('signal_meta')}
             WHERE session_id = ?`,
                [this.sessionId]
            )
        )
        if (!row) throw new Error('signal meta row not found')
        return {
            serverHasPreKeys: Number(row.server_has_prekeys) === 1,
            nextPreKeyId: Number(row.next_prekey_id),
            signedPreKeyRotationTs:
                row.signed_prekey_rotation_ts !== null
                    ? Number(row.signed_prekey_rotation_ts)
                    : null
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

    private async upsertSession(
        executor: { execute: PoolConnection['execute'] },
        target: SignalAddressParts,
        session: SignalSessionRecord
    ): Promise<void> {
        await executor.execute(
            `INSERT INTO ${this.t('signal_session')} (
                session_id, user, server, device, record
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                record = VALUES(record)`,
            [
                this.sessionId,
                target.user,
                target.server,
                target.device,
                encodeSignalSessionRecord(session)
            ]
        )
    }

    private async upsertRemoteIdentity(
        executor: { execute: PoolConnection['execute'] },
        target: SignalAddressParts,
        identityKey: Uint8Array
    ): Promise<void> {
        await executor.execute(
            `INSERT INTO ${this.t('signal_identity')} (
                session_id, user, server, device, identity_key
            ) VALUES (?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                identity_key = VALUES(identity_key)`,
            [this.sessionId, target.user, target.server, target.device, identityKey]
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

    private decodeSignedPreKeyRow(row: MysqlRow): SignedPreKeyRecord {
        return {
            keyId: Number(row.key_id),
            keyPair: {
                pubKey: toBytes(row.pub_key),
                privKey: toBytes(row.priv_key)
            },
            signature: toBytes(row.signature),
            uploaded: row.uploaded !== null ? Number(row.uploaded) === 1 : undefined
        }
    }
}
