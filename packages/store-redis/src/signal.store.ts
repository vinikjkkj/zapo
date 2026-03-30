import type { RegistrationInfo, SignedPreKeyRecord } from 'zapo-js/signal'
import type { WaSignalStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, scanKeys, toBytesOrNull, toRedisBuffer } from './helpers'
import type { WaRedisStorageOptions } from './types'

export class WaSignalRedisStore extends BaseRedisStore implements WaSignalStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    // ── Registration ──────────────────────────────────────────────────

    public async getRegistrationInfo(): Promise<RegistrationInfo | null> {
        const baseKey = this.k('signal:reg', this.sessionId)
        const pipeline = this.redis.pipeline()
        pipeline.hgetall(baseKey)
        pipeline.getBuffer(this.k('signal:reg', this.sessionId, 'pub'))
        pipeline.getBuffer(this.k('signal:reg', this.sessionId, 'priv'))
        const results = await pipeline.exec()
        if (!results) return null
        const [, hashData] = results[0]
        const data = hashData as Record<string, string>
        if (!data || Object.keys(data).length === 0) return null
        const pubKey = toBytesOrNull(results[1][1])
        const privKey = toBytesOrNull(results[2][1])
        if (!pubKey || !privKey) return null
        return {
            registrationId: Number(data.registration_id),
            identityKeyPair: { pubKey, privKey }
        }
    }

    public async setRegistrationInfo(info: RegistrationInfo): Promise<void> {
        const baseKey = this.k('signal:reg', this.sessionId)
        const pipeline = this.redis.pipeline()
        pipeline.hset(baseKey, { registration_id: String(info.registrationId) })
        pipeline.set(
            this.k('signal:reg', this.sessionId, 'pub'),
            toRedisBuffer(info.identityKeyPair.pubKey)
        )
        pipeline.set(
            this.k('signal:reg', this.sessionId, 'priv'),
            toRedisBuffer(info.identityKeyPair.privKey)
        )
        await pipeline.exec()
    }

    // ── Signed PreKey ─────────────────────────────────────────────────

    public async getSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        return this.readSignedPreKey()
    }

    public async setSignedPreKey(record: SignedPreKeyRecord): Promise<void> {
        const baseKey = this.k('signal:spk', this.sessionId)
        const pipeline = this.redis.pipeline()
        pipeline.hset(baseKey, {
            key_id: String(record.keyId),
            uploaded: record.uploaded === true ? '1' : '0'
        })
        pipeline.set(
            this.k('signal:spk', this.sessionId, 'pub'),
            toRedisBuffer(record.keyPair.pubKey)
        )
        pipeline.set(
            this.k('signal:spk', this.sessionId, 'priv'),
            toRedisBuffer(record.keyPair.privKey)
        )
        pipeline.set(this.k('signal:spk', this.sessionId, 'sig'), toRedisBuffer(record.signature))
        await pipeline.exec()
    }

    public async getSignedPreKeyById(keyId: number): Promise<SignedPreKeyRecord | null> {
        const result = await this.readSignedPreKey()
        if (!result || result.keyId !== keyId) return null
        return result
    }

    public async setSignedPreKeyRotationTs(value: number | null): Promise<void> {
        const metaKey = this.k('signal:meta', this.sessionId)
        await this.ensureMetaHash()
        if (value !== null) {
            await this.redis.hset(metaKey, 'signed_prekey_rotation_ts', String(value))
        } else {
            await this.redis.hdel(metaKey, 'signed_prekey_rotation_ts')
        }
    }

    public async getSignedPreKeyRotationTs(): Promise<number | null> {
        const metaKey = this.k('signal:meta', this.sessionId)
        const raw = await this.redis.hget(metaKey, 'signed_prekey_rotation_ts')
        if (raw === null || raw === '') return null
        return Number(raw)
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        const patterns = [
            this.k('signal:meta', this.sessionId),
            this.k('signal:reg', this.sessionId),
            this.k('signal:spk', this.sessionId)
        ]
        const scanPatterns = [
            this.k('signal:reg', this.sessionId, '*'),
            this.k('signal:spk', this.sessionId, '*')
        ]
        const scannedKeys = await Promise.all(scanPatterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = [...patterns, ...scannedKeys.flat()]
        if (allKeys.length > 0) {
            await deleteKeysChunked(this.redis, allKeys)
        }
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async ensureMetaHash(): Promise<void> {
        const metaKey = this.k('signal:meta', this.sessionId)
        const exists = await this.redis.exists(metaKey)
        if (!exists) {
            await this.redis.hsetnx(metaKey, 'server_has_prekeys', '0')
            await this.redis.hsetnx(metaKey, 'next_prekey_id', '1')
        }
    }

    private async readSignedPreKey(): Promise<SignedPreKeyRecord | null> {
        const baseKey = this.k('signal:spk', this.sessionId)
        const pipeline = this.redis.pipeline()
        pipeline.hgetall(baseKey)
        pipeline.getBuffer(this.k('signal:spk', this.sessionId, 'pub'))
        pipeline.getBuffer(this.k('signal:spk', this.sessionId, 'priv'))
        pipeline.getBuffer(this.k('signal:spk', this.sessionId, 'sig'))
        const results = await pipeline.exec()
        if (!results) return null
        const [, hashData] = results[0]
        const data = hashData as Record<string, string>
        if (!data || Object.keys(data).length === 0) return null
        const pubKey = toBytesOrNull(results[1][1])
        const privKey = toBytesOrNull(results[2][1])
        const signature = toBytesOrNull(results[3][1])
        if (!pubKey || !privKey || !signature) return null
        return {
            keyId: Number(data.key_id),
            keyPair: { pubKey, privKey },
            signature,
            uploaded: data.uploaded !== undefined ? data.uploaded === '1' : undefined
        }
    }
}
