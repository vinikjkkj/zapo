import type { WaAuthCredentials } from 'zapo-js/auth'
import { proto } from 'zapo-js/proto'
import type { WaAuthStore } from 'zapo-js/store'

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst, toBytes, toBytesOrNull } from './helpers'
import type { WaMysqlStorageOptions } from './types'

export class WaAuthMysqlStore extends BaseMysqlStore implements WaAuthStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['auth'])
    }

    public async load(): Promise<WaAuthCredentials | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT noise_pub_key, noise_priv_key, registration_id,
                    identity_pub_key, identity_priv_key,
                    signed_prekey_id, signed_prekey_pub_key, signed_prekey_priv_key, signed_prekey_signature,
                    adv_secret_key, signed_identity,
                    me_jid, me_lid, me_display_name, companion_enc_static,
                    platform, server_static_key, server_has_prekeys, routing_info,
                    last_success_ts, props_version, ab_props_version,
                    connection_location, account_creation_ts,
                    device_info, push_name, year_class, mem_class
             FROM ${this.t('auth_credentials')}
             WHERE session_id = ?`,
                [this.sessionId]
            )
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
                row.server_has_prekeys === null ? undefined : Number(row.server_has_prekeys) === 1,
            routingInfo: toBytesOrNull(row.routing_info) ?? undefined,
            lastSuccessTs: row.last_success_ts !== null ? Number(row.last_success_ts) : undefined,
            propsVersion: row.props_version !== null ? Number(row.props_version) : undefined,
            abPropsVersion:
                row.ab_props_version !== null ? Number(row.ab_props_version) : undefined,
            connectionLocation: (row.connection_location as string | null) ?? undefined,
            accountCreationTs:
                row.account_creation_ts !== null ? Number(row.account_creation_ts) : undefined,
            deviceInfo:
                typeof row.device_info === 'string'
                    ? (JSON.parse(row.device_info) as WaAuthCredentials['deviceInfo'])
                    : undefined,
            pushName: (row.push_name as string | null) ?? undefined,
            yearClass: row.year_class !== null ? Number(row.year_class) : undefined,
            memClass: row.mem_class !== null ? Number(row.mem_class) : undefined
        }
    }

    public async save(credentials: WaAuthCredentials): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(
            `INSERT INTO ${this.t('auth_credentials')} (
                session_id, noise_pub_key, noise_priv_key,
                registration_id, identity_pub_key, identity_priv_key,
                signed_prekey_id, signed_prekey_pub_key, signed_prekey_priv_key, signed_prekey_signature,
                adv_secret_key, signed_identity,
                me_jid, me_lid, me_display_name, companion_enc_static,
                platform, server_static_key, server_has_prekeys, routing_info,
                last_success_ts, props_version, ab_props_version,
                connection_location, account_creation_ts,
                device_info, push_name, year_class, mem_class
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                noise_pub_key = VALUES(noise_pub_key),
                noise_priv_key = VALUES(noise_priv_key),
                registration_id = VALUES(registration_id),
                identity_pub_key = VALUES(identity_pub_key),
                identity_priv_key = VALUES(identity_priv_key),
                signed_prekey_id = VALUES(signed_prekey_id),
                signed_prekey_pub_key = VALUES(signed_prekey_pub_key),
                signed_prekey_priv_key = VALUES(signed_prekey_priv_key),
                signed_prekey_signature = VALUES(signed_prekey_signature),
                adv_secret_key = VALUES(adv_secret_key),
                signed_identity = VALUES(signed_identity),
                me_jid = VALUES(me_jid),
                me_lid = VALUES(me_lid),
                me_display_name = VALUES(me_display_name),
                companion_enc_static = VALUES(companion_enc_static),
                platform = VALUES(platform),
                server_static_key = VALUES(server_static_key),
                server_has_prekeys = VALUES(server_has_prekeys),
                routing_info = VALUES(routing_info),
                last_success_ts = VALUES(last_success_ts),
                props_version = VALUES(props_version),
                ab_props_version = VALUES(ab_props_version),
                connection_location = VALUES(connection_location),
                account_creation_ts = VALUES(account_creation_ts),
                device_info = VALUES(device_info),
                push_name = VALUES(push_name),
                year_class = VALUES(year_class),
                mem_class = VALUES(mem_class)`,
            [
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
                credentials.serverHasPreKeys === undefined
                    ? null
                    : credentials.serverHasPreKeys
                      ? 1
                      : 0,
                credentials.routingInfo ?? null,
                credentials.lastSuccessTs ?? null,
                credentials.propsVersion ?? null,
                credentials.abPropsVersion ?? null,
                credentials.connectionLocation ?? null,
                credentials.accountCreationTs ?? null,
                credentials.deviceInfo ? JSON.stringify(credentials.deviceInfo) : null,
                credentials.pushName ?? null,
                credentials.yearClass ?? null,
                credentials.memClass ?? null
            ]
        )
    }

    public async clear(): Promise<void> {
        await this.ensureReady()
        await this.pool.execute(`DELETE FROM ${this.t('auth_credentials')} WHERE session_id = ?`, [
            this.sessionId
        ])
    }
}
