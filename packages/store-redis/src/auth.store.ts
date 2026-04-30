import type { WaAuthCredentials } from 'zapo-js/auth'
import { proto } from 'zapo-js/proto'
import type { WaAuthStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import {
    deleteKeysChunked,
    scanKeys,
    toBytesOrNull,
    toRedisBuffer,
    toStringOrNull
} from './helpers'
import type { WaRedisStorageOptions } from './types'

const BINARY_FIELDS = [
    'noise_pub_key',
    'noise_priv_key',
    'identity_pub_key',
    'identity_priv_key',
    'signed_prekey_pub_key',
    'signed_prekey_priv_key',
    'signed_prekey_signature',
    'adv_secret_key',
    'signed_identity',
    'companion_enc_static',
    'server_static_key',
    'routing_info'
] as const

export class WaAuthRedisStore extends BaseRedisStore implements WaAuthStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    public async load(): Promise<WaAuthCredentials | null> {
        const key = this.k('auth', this.sessionId)

        const pipeline = this.redis.pipeline()
        pipeline.hgetall(key)
        for (const field of BINARY_FIELDS) {
            pipeline.getBuffer(`${key}:${field}`)
        }
        const results = await pipeline.exec()
        if (!results) return null

        const data = results[0][1] as Record<string, string>
        if (!data || Object.keys(data).length === 0) return null

        const bin: Record<string, Uint8Array | null> = {}
        for (let i = 0; i < BINARY_FIELDS.length; i += 1) {
            bin[BINARY_FIELDS[i]] = toBytesOrNull(results[i + 1][1])
        }

        const signedIdentityBytes = bin.signed_identity
        return {
            noiseKeyPair: {
                pubKey: bin.noise_pub_key!,
                privKey: bin.noise_priv_key!
            },
            registrationInfo: {
                registrationId: Number(data.registration_id),
                identityKeyPair: {
                    pubKey: bin.identity_pub_key!,
                    privKey: bin.identity_priv_key!
                }
            },
            signedPreKey: {
                keyId: Number(data.signed_prekey_id),
                keyPair: {
                    pubKey: bin.signed_prekey_pub_key!,
                    privKey: bin.signed_prekey_priv_key!
                },
                signature: bin.signed_prekey_signature!,
                uploaded: false
            },
            advSecretKey: bin.adv_secret_key!,
            signedIdentity: signedIdentityBytes
                ? proto.ADVSignedDeviceIdentity.decode(signedIdentityBytes)
                : undefined,
            meJid: toStringOrNull(data.me_jid) ?? undefined,
            meLid: toStringOrNull(data.me_lid) ?? undefined,
            meDisplayName: toStringOrNull(data.me_display_name) ?? undefined,
            companionEncStatic: bin.companion_enc_static ?? undefined,
            platform: toStringOrNull(data.platform) ?? undefined,
            serverStaticKey: bin.server_static_key ?? undefined,
            serverHasPreKeys:
                toStringOrNull(data.server_has_prekeys) !== null
                    ? data.server_has_prekeys === '1'
                    : undefined,
            routingInfo: bin.routing_info ?? undefined,
            lastSuccessTs:
                toStringOrNull(data.last_success_ts) !== null
                    ? Number(data.last_success_ts)
                    : undefined,
            propsVersion:
                toStringOrNull(data.props_version) !== null
                    ? Number(data.props_version)
                    : undefined,
            abPropsVersion:
                toStringOrNull(data.ab_props_version) !== null
                    ? Number(data.ab_props_version)
                    : undefined,
            connectionLocation: toStringOrNull(data.connection_location) ?? undefined,
            accountCreationTs:
                toStringOrNull(data.account_creation_ts) !== null
                    ? Number(data.account_creation_ts)
                    : undefined,
            deviceInfo:
                toStringOrNull(data.device_info) !== null
                    ? (JSON.parse(data.device_info) as WaAuthCredentials['deviceInfo'])
                    : undefined,
            pushName: toStringOrNull(data.push_name) ?? undefined,
            yearClass:
                toStringOrNull(data.year_class) !== null ? Number(data.year_class) : undefined,
            memClass: toStringOrNull(data.mem_class) !== null ? Number(data.mem_class) : undefined
        }
    }

    public async save(credentials: WaAuthCredentials): Promise<void> {
        const key = this.k('auth', this.sessionId)
        const fields: Record<string, string> = {
            registration_id: String(credentials.registrationInfo.registrationId),
            signed_prekey_id: String(credentials.signedPreKey.keyId)
        }

        if (credentials.meJid !== undefined) {
            fields.me_jid = credentials.meJid
        }
        if (credentials.meLid !== undefined) {
            fields.me_lid = credentials.meLid
        }
        if (credentials.meDisplayName !== undefined) {
            fields.me_display_name = credentials.meDisplayName
        }
        if (credentials.platform !== undefined) {
            fields.platform = credentials.platform
        }
        if (credentials.serverHasPreKeys !== undefined) {
            fields.server_has_prekeys = credentials.serverHasPreKeys ? '1' : '0'
        }
        if (credentials.lastSuccessTs !== undefined) {
            fields.last_success_ts = String(credentials.lastSuccessTs)
        }
        if (credentials.propsVersion !== undefined) {
            fields.props_version = String(credentials.propsVersion)
        }
        if (credentials.abPropsVersion !== undefined) {
            fields.ab_props_version = String(credentials.abPropsVersion)
        }
        if (credentials.connectionLocation !== undefined) {
            fields.connection_location = credentials.connectionLocation
        }
        if (credentials.accountCreationTs !== undefined) {
            fields.account_creation_ts = String(credentials.accountCreationTs)
        }
        if (credentials.deviceInfo !== undefined) {
            fields.device_info = JSON.stringify(credentials.deviceInfo)
        }
        if (credentials.pushName !== undefined) {
            fields.push_name = credentials.pushName
        }
        if (credentials.yearClass !== undefined) {
            fields.year_class = String(credentials.yearClass)
        }
        if (credentials.memClass !== undefined) {
            fields.mem_class = String(credentials.memClass)
        }

        const pipeline = this.redis.pipeline()
        // Delete existing hash and all binary sub-keys first for a full snapshot rewrite
        pipeline.del(key)
        for (const field of BINARY_FIELDS) {
            pipeline.del(`${key}:${field}`)
        }
        pipeline.hset(key, fields)

        // Required binary fields
        pipeline.set(`${key}:noise_pub_key`, toRedisBuffer(credentials.noiseKeyPair.pubKey))
        pipeline.set(`${key}:noise_priv_key`, toRedisBuffer(credentials.noiseKeyPair.privKey))
        pipeline.set(
            `${key}:identity_pub_key`,
            toRedisBuffer(credentials.registrationInfo.identityKeyPair.pubKey)
        )
        pipeline.set(
            `${key}:identity_priv_key`,
            toRedisBuffer(credentials.registrationInfo.identityKeyPair.privKey)
        )
        pipeline.set(
            `${key}:signed_prekey_pub_key`,
            toRedisBuffer(credentials.signedPreKey.keyPair.pubKey)
        )
        pipeline.set(
            `${key}:signed_prekey_priv_key`,
            toRedisBuffer(credentials.signedPreKey.keyPair.privKey)
        )
        pipeline.set(
            `${key}:signed_prekey_signature`,
            toRedisBuffer(credentials.signedPreKey.signature)
        )
        pipeline.set(`${key}:adv_secret_key`, toRedisBuffer(credentials.advSecretKey))

        // Optional binary fields
        if (credentials.signedIdentity) {
            pipeline.set(
                `${key}:signed_identity`,
                toRedisBuffer(
                    proto.ADVSignedDeviceIdentity.encode(credentials.signedIdentity).finish()
                )
            )
        }
        if (credentials.companionEncStatic !== undefined) {
            pipeline.set(
                `${key}:companion_enc_static`,
                toRedisBuffer(credentials.companionEncStatic)
            )
        }
        if (credentials.serverStaticKey !== undefined) {
            pipeline.set(`${key}:server_static_key`, toRedisBuffer(credentials.serverStaticKey))
        }
        if (credentials.routingInfo !== undefined) {
            pipeline.set(`${key}:routing_info`, toRedisBuffer(credentials.routingInfo))
        }

        await pipeline.exec()
    }

    public async clear(): Promise<void> {
        const baseKey = this.k('auth', this.sessionId)
        const subKeys = await scanKeys(this.redis, `${baseKey}:*`)
        if (subKeys.length > 0) {
            await deleteKeysChunked(this.redis, subKeys)
        }
        await this.redis.del(baseKey)
    }
}
