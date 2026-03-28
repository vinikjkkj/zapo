import type { PoolClient } from 'pg'
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

import { BasePgStore } from './BasePgStore'
import { queryFirst, queryRows, safeLimit, toBytes, toBytesOrNull, type PgRow } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const BATCH_SIZE = 250

export class WaSignalPgStore extends BasePgStore implements WaSignalStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['signal'])
    }

    // ── Registration ──────────────────────────────────────────────────

    public async getRegistrationInfo(): Promise<RegistrationInfo | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('signal_get_reg'),
                text: `SELECT registration_id, identity_pub_key, identity_priv_key
                 FROM ${this.t('signal_registration')}
                 WHERE session_id = $1`,
                values: [this.sessionId]
            })
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
        await this.pool.query({
            name: this.stmtName('signal_set_reg'),
            text: `INSERT INTO ${this.t('signal_registration')} (
                session_id, registration_id, identity_pub_key, identity_priv_key
            ) VALUES ($1, $2, $3, $4)
            ON CONFLICT (session_id) DO UPDATE SET
                registration_id = EXCLUDED.registration_id,
                identity_pub_key = EXCLUDED.identity_pub_key,
                identity_priv_key = EXCLUDED.identity_priv_key`,
            values: [
                this.sessionId,
                info.registrationId,
                info.identityKeyPair.pubKey,
                info.identityKeyPair.privKey
            ]
        })
    }

    // ── Signed PreKey ─────────────────────────────────────────────────

    public async getSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('signal_get_signed_pk'),
                text: `SELECT key_id, pub_key, priv_key, signature, uploaded
                 FROM ${this.t('signal_signed_prekey')}
                 WHERE session_id = $1`,
                values: [this.sessionId]
            })
        )
        if (!row) return null
        return this.decodeSignedPreKeyRow(row)
    }

    public async setSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('signal_set_signed_pk'),
            text: `INSERT INTO ${this.t('signal_signed_prekey')} (
                session_id, key_id, pub_key, priv_key, signature, uploaded
            ) VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (session_id) DO UPDATE SET
                key_id = EXCLUDED.key_id,
                pub_key = EXCLUDED.pub_key,
                priv_key = EXCLUDED.priv_key,
                signature = EXCLUDED.signature,
                uploaded = EXCLUDED.uploaded`,
            values: [
                this.sessionId,
                record.keyId,
                record.keyPair.pubKey,
                record.keyPair.privKey,
                record.signature,
                record.uploaded === true ? 1 : 0
            ]
        })
    }

    public async getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('signal_get_signed_pk_by_id'),
                text: `SELECT key_id, pub_key, priv_key, signature, uploaded
                 FROM ${this.t('signal_signed_prekey')}
                 WHERE session_id = $1 AND key_id = $2`,
                values: [this.sessionId, keyId]
            })
        )
        if (!row) return null
        return this.decodeSignedPreKeyRow(row)
    }

    public async setSignedPreKeyRotationTs(value: number | null): Promise<void> {
        await this.withTransaction(async (client) => {
            await this.ensureMetaRow(client)
            await client.query({
                name: this.stmtName('signal_set_spk_rotation_ts'),
                text: `UPDATE ${this.t('signal_meta')}
                 SET signed_prekey_rotation_ts = $1
                 WHERE session_id = $2`,
                values: [value, this.sessionId]
            })
        })
    }

    public async getSignedPreKeyRotationTs(): Promise<number | null> {
        const meta = await this.withTransaction(async (client) => this.getMeta(client))
        return meta.signedPreKeyRotationTs
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
                        name: this.stmtName('signal_insert_prekey_noop'),
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
                name: this.stmtName('signal_get_prekey_by_id'),
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
                    name: this.stmtName('signal_consume_prekey_select'),
                    text: `SELECT key_id, pub_key, priv_key, uploaded
                     FROM ${this.t('signal_prekey')}
                     WHERE session_id = $1 AND key_id = $2
                     FOR UPDATE`,
                    values: [this.sessionId, keyId]
                })
            )
            if (!row) return null
            await client.query({
                name: this.stmtName('signal_consume_prekey_delete'),
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
            name: this.stmtName('signal_mark_key_uploaded'),
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
                name: this.stmtName('signal_set_server_has_prekeys'),
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

    // ── Meta ──────────────────────────────────────────────────────────

    public async getSignalMeta(): Promise<WaSignalMetaSnapshot> {
        return this.withTransaction(async (client) => {
            await this.ensureMetaRow(client)
            const row = queryFirst(
                await client.query({
                    name: this.stmtName('signal_get_meta_snapshot'),
                    text: `SELECT
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
                     WHERE m.session_id = $1`,
                    values: [this.sessionId]
                })
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
                await this.pool.query({
                    name: this.stmtName('signal_has_session'),
                    text: `SELECT 1 AS has_session
                     FROM ${this.t('signal_session')}
                     WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4
                     LIMIT 1`,
                    values: [this.sessionId, target.user, target.server, target.device]
                })
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
            let paramIdx = 2
            const addrClauses = batch
                .map(() => {
                    const clause = `("user" = $${paramIdx} AND server = $${paramIdx + 1} AND device = $${paramIdx + 2})`
                    paramIdx += 3
                    return clause
                })
                .join(' OR ')
            const params: PgParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT "user", server, device
                     FROM ${this.t('signal_session')}
                     WHERE session_id = $1 AND (${addrClauses})`,
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
            await this.pool.query({
                name: this.stmtName('signal_get_session'),
                text: `SELECT record
                 FROM ${this.t('signal_session')}
                 WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4`,
                values: [this.sessionId, target.user, target.server, target.device]
            })
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
            let paramIdx = 2
            const addrClauses = batch
                .map(() => {
                    const clause = `("user" = $${paramIdx} AND server = $${paramIdx + 1} AND device = $${paramIdx + 2})`
                    paramIdx += 3
                    return clause
                })
                .join(' OR ')
            const params: PgParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT "user", server, device, record
                     FROM ${this.t('signal_session')}
                     WHERE session_id = $1 AND (${addrClauses})`,
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
        await this.withTransaction(async (client) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                await this.upsertSession(client, target, entry.session)
            }
        })
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        await this.pool.query({
            name: this.stmtName('signal_delete_session'),
            text: `DELETE FROM ${this.t('signal_session')}
             WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4`,
            values: [this.sessionId, target.user, target.server, target.device]
        })
    }

    // ── Identities ────────────────────────────────────────────────────

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        await this.ensureReady()
        const target = toSignalAddressParts(address)
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('signal_get_remote_identity'),
                text: `SELECT identity_key
                 FROM ${this.t('signal_identity')}
                 WHERE session_id = $1 AND "user" = $2 AND server = $3 AND device = $4`,
                values: [this.sessionId, target.user, target.server, target.device]
            })
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
            let paramIdx = 2
            const addrClauses = batch
                .map(() => {
                    const clause = `("user" = $${paramIdx} AND server = $${paramIdx + 1} AND device = $${paramIdx + 2})`
                    paramIdx += 3
                    return clause
                })
                .join(' OR ')
            const params: PgParam[] = [
                this.sessionId,
                ...batch.flatMap((t) => [t.user, t.server, t.device])
            ]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT "user", server, device, identity_key
                     FROM ${this.t('signal_identity')}
                     WHERE session_id = $1 AND (${addrClauses})`,
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
        await this.withTransaction(async (client) => {
            for (const entry of entries) {
                const target = toSignalAddressParts(entry.address)
                await this.upsertRemoteIdentity(client, target, entry.identityKey)
            }
        })
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        await this.withTransaction(async (client) => {
            await client.query({
                name: this.stmtName('signal_clear_registration'),
                text: `DELETE FROM ${this.t('signal_registration')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('signal_clear_signed_prekey'),
                text: `DELETE FROM ${this.t('signal_signed_prekey')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('signal_clear_prekey'),
                text: `DELETE FROM ${this.t('signal_prekey')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('signal_clear_session'),
                text: `DELETE FROM ${this.t('signal_session')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('signal_clear_identity'),
                text: `DELETE FROM ${this.t('signal_identity')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('signal_clear_meta'),
                text: `DELETE FROM ${this.t('signal_meta')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async ensureMetaRow(client: PoolClient): Promise<void> {
        await client.query({
            name: this.stmtName('signal_ensure_meta'),
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
        signedPreKeyRotationTs: number | null
    }> {
        await this.ensureMetaRow(client)
        const row = queryFirst(
            await client.query({
                name: this.stmtName('signal_get_meta'),
                text: `SELECT server_has_prekeys, next_prekey_id, signed_prekey_rotation_ts
                 FROM ${this.t('signal_meta')}
                 WHERE session_id = $1`,
                values: [this.sessionId]
            })
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
        client: PoolClient,
        limit: number
    ): Promise<PreKeyRecord[]> {
        const resolved = safeLimit(limit, 100)
        return queryRows(
            await client.query({
                name: this.stmtName('signal_select_available_prekeys'),
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
            name: this.stmtName('signal_upsert_prekey'),
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
            name: this.stmtName('signal_update_next_prekey_id'),
            text: `UPDATE ${this.t('signal_meta')} SET next_prekey_id = GREATEST(next_prekey_id, $1) WHERE session_id = $2`,
            values: [minNextId, this.sessionId]
        })
    }

    private async upsertSession(
        executor: { query: PoolClient['query'] },
        target: SignalAddressParts,
        session: SignalSessionRecord
    ): Promise<void> {
        await executor.query({
            name: this.stmtName('signal_upsert_session'),
            text: `INSERT INTO ${this.t('signal_session')} (
                session_id, "user", server, device, record
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, "user", server, device) DO UPDATE SET
                record = EXCLUDED.record`,
            values: [
                this.sessionId,
                target.user,
                target.server,
                target.device,
                encodeSignalSessionRecord(session)
            ]
        })
    }

    private async upsertRemoteIdentity(
        executor: { query: PoolClient['query'] },
        target: SignalAddressParts,
        identityKey: Uint8Array
    ): Promise<void> {
        await executor.query({
            name: this.stmtName('signal_upsert_remote_identity'),
            text: `INSERT INTO ${this.t('signal_identity')} (
                session_id, "user", server, device, identity_key
            ) VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (session_id, "user", server, device) DO UPDATE SET
                identity_key = EXCLUDED.identity_key`,
            values: [this.sessionId, target.user, target.server, target.device, identityKey]
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

    private decodeSignedPreKeyRow(row: PgRow): SignedPreKeyRecord {
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
