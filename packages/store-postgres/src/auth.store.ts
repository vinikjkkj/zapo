import type { WaAuthCredentials } from 'zapo-js/auth'
import { proto } from 'zapo-js/proto'
import type { WaAuthStore } from 'zapo-js/store'

import { BasePgStore } from './BasePgStore'
import { queryFirst, toBytes, toBytesOrNull } from './helpers'
import type { WaPgStorageOptions } from './types'

export class WaAuthPgStore extends BasePgStore implements WaAuthStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['auth'])
    }

    public async load(): Promise<WaAuthCredentials | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('auth_load'),
                text: `SELECT noise_pub_key, noise_priv_key, registration_id,
                    identity_pub_key, identity_priv_key,
                    signed_prekey_id, signed_prekey_pub_key, signed_prekey_priv_key, signed_prekey_signature,
                    adv_secret_key, signed_identity,
                    me_jid, me_lid, me_display_name, companion_enc_static,
                    platform, server_static_key, server_has_prekeys, routing_info,
                    last_success_ts, props_version, ab_props_version,
                    connection_location, account_creation_ts
             FROM ${this.t('auth_credentials')}
             WHERE session_id = $1`,
                values: [this.sessionId]
            })
        )
        if (!row) return null

        const signedIdentityBytes = toBytesOrNull(row.signed_identity)

        return {
            noiseKeyPair: {
                pubKey: toBytes(row.noise_pub_key),
                privKey: toBytes(row.noise_priv_key)
            },
            registrationInfo: {
                registrationId: Number(row.registration_id),
                identityKeyPair: {
                    pubKey: toBytes(row.identity_pub_key),
                    privKey: toBytes(row.identity_priv_key)
                }
            },
            signedPreKey: {
                keyId: Number(row.signed_prekey_id),
                keyPair: {
                    pubKey: toBytes(row.signed_prekey_pub_key),
                    privKey: toBytes(row.signed_prekey_priv_key)
                },
                signature: toBytes(row.signed_prekey_signature),
                uploaded: false
            },
            advSecretKey: toBytes(row.adv_secret_key),
            signedIdentity: signedIdentityBytes
                ? proto.ADVSignedDeviceIdentity.decode(signedIdentityBytes)
                : undefined,
            meJid: (row.me_jid as string | null) ?? undefined,
            meLid: (row.me_lid as string | null) ?? undefined,
            meDisplayName: (row.me_display_name as string | null) ?? undefined,
            companionEncStatic: toBytesOrNull(row.companion_enc_static) ?? undefined,
            platform: (row.platform as string | null) ?? undefined,
            serverStaticKey: toBytesOrNull(row.server_static_key) ?? undefined,
            serverHasPreKeys:
                row.server_has_prekeys === null ? undefined : Boolean(row.server_has_prekeys),
            routingInfo: toBytesOrNull(row.routing_info) ?? undefined,
            lastSuccessTs: row.last_success_ts !== null ? Number(row.last_success_ts) : undefined,
            propsVersion: row.props_version !== null ? Number(row.props_version) : undefined,
            abPropsVersion:
                row.ab_props_version !== null ? Number(row.ab_props_version) : undefined,
            connectionLocation: (row.connection_location as string | null) ?? undefined,
            accountCreationTs:
                row.account_creation_ts !== null ? Number(row.account_creation_ts) : undefined
        }
    }

    public async save(credentials: WaAuthCredentials): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('auth_save'),
            text: `INSERT INTO ${this.t('auth_credentials')} (
                session_id, noise_pub_key, noise_priv_key,
                registration_id, identity_pub_key, identity_priv_key,
                signed_prekey_id, signed_prekey_pub_key, signed_prekey_priv_key, signed_prekey_signature,
                adv_secret_key, signed_identity,
                me_jid, me_lid, me_display_name, companion_enc_static,
                platform, server_static_key, server_has_prekeys, routing_info,
                last_success_ts, props_version, ab_props_version,
                connection_location, account_creation_ts
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
            ON CONFLICT (session_id) DO UPDATE SET
                noise_pub_key = EXCLUDED.noise_pub_key,
                noise_priv_key = EXCLUDED.noise_priv_key,
                registration_id = EXCLUDED.registration_id,
                identity_pub_key = EXCLUDED.identity_pub_key,
                identity_priv_key = EXCLUDED.identity_priv_key,
                signed_prekey_id = EXCLUDED.signed_prekey_id,
                signed_prekey_pub_key = EXCLUDED.signed_prekey_pub_key,
                signed_prekey_priv_key = EXCLUDED.signed_prekey_priv_key,
                signed_prekey_signature = EXCLUDED.signed_prekey_signature,
                adv_secret_key = EXCLUDED.adv_secret_key,
                signed_identity = EXCLUDED.signed_identity,
                me_jid = EXCLUDED.me_jid,
                me_lid = EXCLUDED.me_lid,
                me_display_name = EXCLUDED.me_display_name,
                companion_enc_static = EXCLUDED.companion_enc_static,
                platform = EXCLUDED.platform,
                server_static_key = EXCLUDED.server_static_key,
                server_has_prekeys = EXCLUDED.server_has_prekeys,
                routing_info = EXCLUDED.routing_info,
                last_success_ts = EXCLUDED.last_success_ts,
                props_version = EXCLUDED.props_version,
                ab_props_version = EXCLUDED.ab_props_version,
                connection_location = EXCLUDED.connection_location,
                account_creation_ts = EXCLUDED.account_creation_ts`,
            values: [
                this.sessionId,
                credentials.noiseKeyPair.pubKey,
                credentials.noiseKeyPair.privKey,
                credentials.registrationInfo.registrationId,
                credentials.registrationInfo.identityKeyPair.pubKey,
                credentials.registrationInfo.identityKeyPair.privKey,
                credentials.signedPreKey.keyId,
                credentials.signedPreKey.keyPair.pubKey,
                credentials.signedPreKey.keyPair.privKey,
                credentials.signedPreKey.signature,
                credentials.advSecretKey,
                credentials.signedIdentity
                    ? proto.ADVSignedDeviceIdentity.encode(credentials.signedIdentity).finish()
                    : null,
                credentials.meJid ?? null,
                credentials.meLid ?? null,
                credentials.meDisplayName ?? null,
                credentials.companionEncStatic ?? null,
                credentials.platform ?? null,
                credentials.serverStaticKey ?? null,
                credentials.serverHasPreKeys ?? null,
                credentials.routingInfo ?? null,
                credentials.lastSuccessTs ?? null,
                credentials.propsVersion ?? null,
                credentials.abPropsVersion ?? null,
                credentials.connectionLocation ?? null,
                credentials.accountCreationTs ?? null
            ]
        })
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.query({
            name: this.stmtName('auth_clear'),
            text: `DELETE FROM ${this.t('auth_credentials')} WHERE session_id = $1`,
            values: [this.sessionId]
        })
    }
}
