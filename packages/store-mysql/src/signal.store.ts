import type { PoolConnection } from 'mysql2/promise'
import type { RegistrationInfo, SignedPreKeyRecord } from 'zapo-js/signal'
import type { WaSignalStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst, toBytes, type MysqlRow } from './helpers'
import type { WaMysqlStorageOptions } from './types'

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
        signedPreKeyRotationTs: number | null
    }> {
        await this.ensureMetaRow(conn)
        const row = queryFirst(
            await conn.execute(
                `SELECT signed_prekey_rotation_ts
             FROM ${this.t('signal_meta')}
             WHERE session_id = ?`,
                [this.sessionId]
            )
        )
        if (!row) throw new Error('signal meta row not found')
        return {
            signedPreKeyRotationTs:
                row.signed_prekey_rotation_ts !== null
                    ? Number(row.signed_prekey_rotation_ts)
                    : null
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
