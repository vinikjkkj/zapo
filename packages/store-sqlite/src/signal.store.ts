import type {
    SignalMetaRow,
    SignalRegistrationRow,
    SignalSignedPreKeyRow,
    RegistrationInfo,
    SignedPreKeyRecord
} from 'zapo-js/signal'
import { decodeSignalRegistrationRow, decodeSignalSignedPreKeyRow } from 'zapo-js/signal'
import type { WaSignalStore as WaSignalStoreContract } from 'zapo-js/store'
import { asOptionalNumber } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteConnection } from './connection'
import type { WaSqliteStorageOptions } from './types'

export class WaSignalSqliteStore extends BaseSqliteStore implements WaSignalStoreContract {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['signal'])
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

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM signal_registration WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM signal_signed_prekey WHERE session_id = ?', [
                this.options.sessionId
            ])
            db.run('DELETE FROM signal_meta WHERE session_id = ?', [this.options.sessionId])
        })
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
        signedPreKeyRotationTs: number | null
    } {
        this.ensureMetaRow(db)
        const row = db.get<SignalMetaRow>(
            `SELECT signed_prekey_rotation_ts
             FROM signal_meta
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        return {
            signedPreKeyRotationTs:
                asOptionalNumber(
                    row!.signed_prekey_rotation_ts,
                    'signal_meta.signed_prekey_rotation_ts'
                ) ?? null
        }
    }
}
