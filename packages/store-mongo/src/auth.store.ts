import type { Binary } from 'mongodb'
import type { WaAuthCredentials } from 'zapo-js/auth'
import { proto } from 'zapo-js/proto'
import type { WaAuthStore } from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, fromBinaryOrNull, toBinary } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface AuthDoc {
    _id: string
    noise_pub_key: Binary
    noise_priv_key: Binary
    registration_id: number
    identity_pub_key: Binary
    identity_priv_key: Binary
    signed_prekey_id: number
    signed_prekey_pub_key: Binary
    signed_prekey_priv_key: Binary
    signed_prekey_signature: Binary
    adv_secret_key: Binary
    signed_identity: Binary | null
    me_jid: string | null
    me_lid: string | null
    me_display_name: string | null
    companion_enc_static: Binary | null
    platform: string | null
    server_static_key: Binary | null
    server_has_prekeys: boolean | null
    routing_info: Binary | null
    last_success_ts: number | null
    props_version: number | null
    ab_props_version: number | null
    connection_location: string | null
    account_creation_ts: number | null
}

const COLLECTION = 'auth_credentials'

export class WaAuthMongoStore extends BaseMongoStore implements WaAuthStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    public async load(): Promise<WaAuthCredentials | null> {
        await this.ensureIndexes()
        const doc = await this.col<AuthDoc>(COLLECTION).findOne({ _id: this.sessionId })
        if (!doc) return null

        const signedIdentityBytes = fromBinaryOrNull(doc.signed_identity)

        return {
            noiseKeyPair: {
                pubKey: fromBinary(doc.noise_pub_key),
                privKey: fromBinary(doc.noise_priv_key)
            },
            registrationInfo: {
                registrationId: Number(doc.registration_id),
                identityKeyPair: {
                    pubKey: fromBinary(doc.identity_pub_key),
                    privKey: fromBinary(doc.identity_priv_key)
                }
            },
            signedPreKey: {
                keyId: Number(doc.signed_prekey_id),
                keyPair: {
                    pubKey: fromBinary(doc.signed_prekey_pub_key),
                    privKey: fromBinary(doc.signed_prekey_priv_key)
                },
                signature: fromBinary(doc.signed_prekey_signature),
                uploaded: false
            },
            advSecretKey: fromBinary(doc.adv_secret_key),
            signedIdentity: signedIdentityBytes
                ? proto.ADVSignedDeviceIdentity.decode(signedIdentityBytes)
                : undefined,
            meJid: doc.me_jid ?? undefined,
            meLid: doc.me_lid ?? undefined,
            meDisplayName: doc.me_display_name ?? undefined,
            companionEncStatic: fromBinaryOrNull(doc.companion_enc_static) ?? undefined,
            platform: doc.platform ?? undefined,
            serverStaticKey: fromBinaryOrNull(doc.server_static_key) ?? undefined,
            serverHasPreKeys:
                doc.server_has_prekeys === null || doc.server_has_prekeys === undefined
                    ? undefined
                    : Boolean(doc.server_has_prekeys),
            routingInfo: fromBinaryOrNull(doc.routing_info) ?? undefined,
            lastSuccessTs: doc.last_success_ts !== null ? Number(doc.last_success_ts) : undefined,
            propsVersion: doc.props_version !== null ? Number(doc.props_version) : undefined,
            abPropsVersion:
                doc.ab_props_version !== null ? Number(doc.ab_props_version) : undefined,
            connectionLocation: doc.connection_location ?? undefined,
            accountCreationTs:
                doc.account_creation_ts !== null ? Number(doc.account_creation_ts) : undefined
        }
    }

    public async save(credentials: WaAuthCredentials): Promise<void> {
        await this.ensureIndexes()
        await this.col<AuthDoc>(COLLECTION).updateOne(
            { _id: this.sessionId },
            {
                $set: {
                    noise_pub_key: toBinary(credentials.noiseKeyPair.pubKey),
                    noise_priv_key: toBinary(credentials.noiseKeyPair.privKey),
                    registration_id: credentials.registrationInfo.registrationId,
                    identity_pub_key: toBinary(credentials.registrationInfo.identityKeyPair.pubKey),
                    identity_priv_key: toBinary(
                        credentials.registrationInfo.identityKeyPair.privKey
                    ),
                    signed_prekey_id: credentials.signedPreKey.keyId,
                    signed_prekey_pub_key: toBinary(credentials.signedPreKey.keyPair.pubKey),
                    signed_prekey_priv_key: toBinary(credentials.signedPreKey.keyPair.privKey),
                    signed_prekey_signature: toBinary(credentials.signedPreKey.signature),
                    adv_secret_key: toBinary(credentials.advSecretKey),
                    signed_identity: credentials.signedIdentity
                        ? toBinary(
                              proto.ADVSignedDeviceIdentity.encode(
                                  credentials.signedIdentity
                              ).finish()
                          )
                        : null,
                    me_jid: credentials.meJid ?? null,
                    me_lid: credentials.meLid ?? null,
                    me_display_name: credentials.meDisplayName ?? null,
                    companion_enc_static: credentials.companionEncStatic
                        ? toBinary(credentials.companionEncStatic)
                        : null,
                    platform: credentials.platform ?? null,
                    server_static_key: credentials.serverStaticKey
                        ? toBinary(credentials.serverStaticKey)
                        : null,
                    server_has_prekeys: credentials.serverHasPreKeys ?? null,
                    routing_info: credentials.routingInfo
                        ? toBinary(credentials.routingInfo)
                        : null,
                    last_success_ts: credentials.lastSuccessTs ?? null,
                    props_version: credentials.propsVersion ?? null,
                    ab_props_version: credentials.abPropsVersion ?? null,
                    connection_location: credentials.connectionLocation ?? null,
                    account_creation_ts: credentials.accountCreationTs ?? null
                }
            },
            { upsert: true }
        )
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await this.col<AuthDoc>(COLLECTION).deleteOne({ _id: this.sessionId })
    }
}
