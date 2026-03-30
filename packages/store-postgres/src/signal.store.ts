import type { PoolClient } from 'pg'
import type { RegistrationInfo, SignedPreKeyRecord } from 'zapo-js/signal'
import type { WaSignalStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { queryFirst, toBytes, type PgRow } from './helpers'
import type { WaPgStorageOptions } from './types'

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
                name: this.stmtName('signal_clear_meta_signal'),
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
            signedPreKeyRotationTs:
                row.signed_prekey_rotation_ts !== null
                    ? Number(row.signed_prekey_rotation_ts)
                    : null
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
