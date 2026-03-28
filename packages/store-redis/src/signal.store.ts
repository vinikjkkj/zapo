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
    toSignalAddressParts
} from 'zapo-js/signal'
import type { WaSignalStore, WaSignalMetaSnapshot } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { safeLimit, scanKeys, toBytesOrNull, toRedisBuffer, toStringOrNull } from './helpers'
import type { WaRedisStorageOptions } from './types'

const LUA_CONSUME_PREKEY = `
local hashKey = KEYS[1]
local pubKey  = KEYS[2]
local privKey = KEYS[3]
local idsKey  = KEYS[4]
local availKey = KEYS[5]
local keyId   = ARGV[1]
local data = redis.call('HGETALL', hashKey)
if #data == 0 then
    return nil
end
redis.call('DEL', hashKey, pubKey, privKey)
redis.call('SREM', idsKey, keyId)
redis.call('ZREM', availKey, keyId)
return data
`

const LUA_RESERVE_PREKEY_IDS = `
local metaKey = KEYS[1]
local count = tonumber(ARGV[1])
local nextId = tonumber(redis.call('HGET', metaKey, 'next_prekey_id') or '1')
local ids = {}
for i = 0, count - 1 do
    ids[i + 1] = nextId + i
end
redis.call('HSET', metaKey, 'next_prekey_id', tostring(nextId + count))
return ids
`

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

    // ── PreKeys ───────────────────────────────────────────────────────

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        await this.ensureMetaHash()
        await this.upsertPreKey(record)
        const metaKey = this.k('signal:meta', this.sessionId)
        const current = await this.redis.hget(metaKey, 'next_prekey_id')
        const currentId = current ? Number(current) : 1
        if (record.keyId + 1 > currentId) {
            await this.redis.hset(metaKey, 'next_prekey_id', String(record.keyId + 1))
        }
    }

    public async getOrGenPreKeys(
        count: number,
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<readonly PreKeyRecord[]> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid prekey count: ${count}`)
        }

        while (true) {
            await this.ensureMetaHash()
            const availKey = this.k('signal:pk:avail', this.sessionId)
            const resolved = safeLimit(count, 100)

            const availableIds = await this.redis.zrangebyscore(
                availKey,
                '-inf',
                '+inf',
                'LIMIT',
                0,
                resolved
            )
            const available: PreKeyRecord[] = []
            if (availableIds.length > 0) {
                const pipeline = this.redis.pipeline()
                for (const id of availableIds) {
                    pipeline.hgetall(this.k('signal:pk', this.sessionId, id))
                    pipeline.getBuffer(this.k('signal:pk', this.sessionId, id, 'pub'))
                    pipeline.getBuffer(this.k('signal:pk', this.sessionId, id, 'priv'))
                }
                const results = await pipeline.exec()
                if (results) {
                    for (let i = 0; i < availableIds.length; i += 1) {
                        const base = i * 3
                        const [hashErr, hashData] = results[base]
                        const record = hashData as Record<string, string>
                        if (hashErr || !record || Object.keys(record).length === 0) continue
                        const pubKey = toBytesOrNull(results[base + 1][1])
                        const privKey = toBytesOrNull(results[base + 2][1])
                        if (!pubKey || !privKey) continue
                        available.push({
                            keyId: Number(availableIds[i]),
                            keyPair: { pubKey, privKey },
                            uploaded:
                                record.uploaded !== undefined ? record.uploaded === '1' : undefined
                        })
                    }
                }
            }

            const missing = count - available.length
            if (missing <= 0) {
                return available.slice(0, count)
            }

            const metaKey = this.k('signal:meta', this.sessionId)
            const reservedIds = (await this.redis.eval(
                LUA_RESERVE_PREKEY_IDS,
                1,
                metaKey,
                String(missing)
            )) as number[]

            const generated: PreKeyRecord[] = []
            let maxId = reservedIds[reservedIds.length - 1]
            for (const keyId of reservedIds) {
                const record = await generator(keyId)
                generated.push(record)
                if (record.keyId > maxId) {
                    maxId = record.keyId
                }
            }

            const pipeline = this.redis.pipeline()
            const idsKey = this.k('signal:pk:ids', this.sessionId)
            for (const record of generated) {
                const idStr = String(record.keyId)
                const pkKey = this.k('signal:pk', this.sessionId, idStr)
                pipeline.hset(pkKey, {
                    uploaded: record.uploaded === true ? '1' : '0'
                })
                pipeline.set(
                    this.k('signal:pk', this.sessionId, idStr, 'pub'),
                    toRedisBuffer(record.keyPair.pubKey)
                )
                pipeline.set(
                    this.k('signal:pk', this.sessionId, idStr, 'priv'),
                    toRedisBuffer(record.keyPair.privKey)
                )
                pipeline.sadd(idsKey, idStr)
                if (record.uploaded !== true) {
                    pipeline.zadd(availKey, record.keyId, idStr)
                }
            }
            // next_prekey_id is already atomically updated by LUA_RESERVE_PREKEY_IDS;
            // only reconcile if the generator produced IDs beyond the reserved range
            if (maxId + 1 > reservedIds[reservedIds.length - 1] + 1) {
                pipeline.hset(metaKey, 'next_prekey_id', String(maxId + 1))
            }
            await pipeline.exec()

            const recheckIds = await this.redis.zrangebyscore(
                availKey,
                '-inf',
                '+inf',
                'LIMIT',
                0,
                resolved
            )
            if (recheckIds.length >= count) {
                const fetchPipeline = this.redis.pipeline()
                for (const id of recheckIds.slice(0, count)) {
                    fetchPipeline.hgetall(this.k('signal:pk', this.sessionId, id))
                    fetchPipeline.getBuffer(this.k('signal:pk', this.sessionId, id, 'pub'))
                    fetchPipeline.getBuffer(this.k('signal:pk', this.sessionId, id, 'priv'))
                }
                const fetchResults = await fetchPipeline.exec()
                const finalKeys: PreKeyRecord[] = []
                if (fetchResults) {
                    for (let i = 0; i < Math.min(recheckIds.length, count); i += 1) {
                        const base = i * 3
                        const [hashErr, hashData] = fetchResults[base]
                        const record = hashData as Record<string, string>
                        if (hashErr || !record || Object.keys(record).length === 0) continue
                        const pubKey = toBytesOrNull(fetchResults[base + 1][1])
                        const privKey = toBytesOrNull(fetchResults[base + 2][1])
                        if (!pubKey || !privKey) continue
                        finalKeys.push({
                            keyId: Number(recheckIds[i]),
                            keyPair: { pubKey, privKey },
                            uploaded:
                                record.uploaded !== undefined ? record.uploaded === '1' : undefined
                        })
                    }
                }
                if (finalKeys.length >= count) {
                    return finalKeys.slice(0, count)
                }
            }
        }
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        const idStr = String(keyId)
        const pipeline = this.redis.pipeline()
        pipeline.hgetall(this.k('signal:pk', this.sessionId, idStr))
        pipeline.getBuffer(this.k('signal:pk', this.sessionId, idStr, 'pub'))
        pipeline.getBuffer(this.k('signal:pk', this.sessionId, idStr, 'priv'))
        const results = await pipeline.exec()
        if (!results) return null
        const [hashErr, hashData] = results[0]
        const data = hashData as Record<string, string>
        if (hashErr || !data || Object.keys(data).length === 0) return null
        const pubKey = toBytesOrNull(results[1][1])
        const privKey = toBytesOrNull(results[2][1])
        if (!pubKey || !privKey) return null
        return {
            keyId,
            keyPair: { pubKey, privKey },
            uploaded: data.uploaded !== undefined ? data.uploaded === '1' : undefined
        }
    }

    public async getPreKeysById(
        keyIds: readonly number[]
    ): Promise<readonly (PreKeyRecord | null)[]> {
        if (keyIds.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const keyId of keyIds) {
            const idStr = String(keyId)
            pipeline.hgetall(this.k('signal:pk', this.sessionId, idStr))
            pipeline.getBuffer(this.k('signal:pk', this.sessionId, idStr, 'pub'))
            pipeline.getBuffer(this.k('signal:pk', this.sessionId, idStr, 'priv'))
        }
        const results = await pipeline.exec()
        if (!results) return keyIds.map(() => null)
        return keyIds.map((keyId, index) => {
            const base = index * 3
            const [hashErr, hashData] = results[base]
            const data = hashData as Record<string, string>
            if (hashErr || !data || Object.keys(data).length === 0) return null
            const pubKey = toBytesOrNull(results[base + 1][1])
            const privKey = toBytesOrNull(results[base + 2][1])
            if (!pubKey || !privKey) return null
            return {
                keyId,
                keyPair: { pubKey, privKey },
                uploaded: data.uploaded !== undefined ? data.uploaded === '1' : undefined
            }
        })
    }

    public async consumePreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        const idStr = String(keyId)
        const hashKey = this.k('signal:pk', this.sessionId, idStr)
        const pubBinKey = this.k('signal:pk', this.sessionId, idStr, 'pub')
        const privBinKey = this.k('signal:pk', this.sessionId, idStr, 'priv')
        const idsKey = this.k('signal:pk:ids', this.sessionId)
        const availKey = this.k('signal:pk:avail', this.sessionId)

        // Read binary keys before the Lua script deletes them
        const binPipeline = this.redis.pipeline()
        binPipeline.getBuffer(pubBinKey)
        binPipeline.getBuffer(privBinKey)
        const binResults = await binPipeline.exec()
        if (!binResults) return null
        const pubKey = toBytesOrNull(binResults[0][1])
        const privKey = toBytesOrNull(binResults[1][1])

        const raw = (await this.redis.eval(
            LUA_CONSUME_PREKEY,
            5,
            hashKey,
            pubBinKey,
            privBinKey,
            idsKey,
            availKey,
            idStr
        )) as string[] | null
        if (!raw || raw.length === 0) return null
        if (!pubKey || !privKey) return null

        const data: Record<string, string> = {}
        for (let i = 0; i < raw.length; i += 2) {
            data[raw[i]] = raw[i + 1]
        }
        return {
            keyId,
            keyPair: { pubKey, privKey },
            uploaded: data.uploaded !== undefined ? data.uploaded === '1' : undefined
        }
    }

    public async getOrGenSinglePreKey(
        generator: (keyId: number) => PreKeyRecord | Promise<PreKeyRecord>
    ): Promise<PreKeyRecord> {
        const records = await this.getOrGenPreKeys(1, generator)
        return records[0]
    }

    public async markKeyAsUploaded(keyId: number): Promise<void> {
        const metaKey = this.k('signal:meta', this.sessionId)
        const raw = await this.redis.hget(metaKey, 'next_prekey_id')
        const nextId = raw ? Number(raw) : 1
        if (keyId < 0 || keyId >= nextId) {
            throw new Error(`prekey ${keyId} is out of boundary`)
        }

        const idsKey = this.k('signal:pk:ids', this.sessionId)
        const allIds = await this.redis.smembers(idsKey)
        const availKey = this.k('signal:pk:avail', this.sessionId)
        const pipeline = this.redis.pipeline()
        for (const idStr of allIds) {
            const id = Number(idStr)
            if (id <= keyId) {
                const pkKey = this.k('signal:pk', this.sessionId, idStr)
                pipeline.hset(pkKey, 'uploaded', '1')
                pipeline.zrem(availKey, idStr)
            }
        }
        await pipeline.exec()
    }

    // ── Server State ──────────────────────────────────────────────────

    public async setServerHasPreKeys(value: boolean): Promise<void> {
        await this.ensureMetaHash()
        const metaKey = this.k('signal:meta', this.sessionId)
        await this.redis.hset(metaKey, 'server_has_prekeys', value ? '1' : '0')
    }

    public async getServerHasPreKeys(): Promise<boolean> {
        const metaKey = this.k('signal:meta', this.sessionId)
        const raw = await this.redis.hget(metaKey, 'server_has_prekeys')
        return raw === '1'
    }

    // ── Meta ──────────────────────────────────────────────────────────

    public async getSignalMeta(): Promise<WaSignalMetaSnapshot> {
        await this.ensureMetaHash()

        const pipeline = this.redis.pipeline()
        pipeline.hgetall(this.k('signal:meta', this.sessionId))
        pipeline.hgetall(this.k('signal:reg', this.sessionId))
        pipeline.getBuffer(this.k('signal:reg', this.sessionId, 'pub'))
        pipeline.getBuffer(this.k('signal:reg', this.sessionId, 'priv'))
        pipeline.hgetall(this.k('signal:spk', this.sessionId))
        pipeline.getBuffer(this.k('signal:spk', this.sessionId, 'pub'))
        pipeline.getBuffer(this.k('signal:spk', this.sessionId, 'priv'))
        pipeline.getBuffer(this.k('signal:spk', this.sessionId, 'sig'))
        const results = await pipeline.exec()
        if (!results) {
            return {
                serverHasPreKeys: false,
                signedPreKeyRotationTs: null,
                registrationInfo: null,
                signedPreKey: null
            }
        }

        const metaData = results[0][1] as Record<string, string>
        const serverHasPreKeys = metaData.server_has_prekeys === '1'
        const signedPreKeyRotationTs =
            toStringOrNull(metaData.signed_prekey_rotation_ts) !== null
                ? Number(metaData.signed_prekey_rotation_ts)
                : null

        const regData = results[1][1] as Record<string, string>
        let registrationInfo: RegistrationInfo | null = null
        if (regData && Object.keys(regData).length > 0) {
            const regPub = toBytesOrNull(results[2][1])
            const regPriv = toBytesOrNull(results[3][1])
            if (regPub && regPriv) {
                registrationInfo = {
                    registrationId: Number(regData.registration_id),
                    identityKeyPair: { pubKey: regPub, privKey: regPriv }
                }
            }
        }

        const spkData = results[4][1] as Record<string, string>
        let signedPreKey: SignedPreKeyRecord | null = null
        if (spkData && Object.keys(spkData).length > 0) {
            const spkPub = toBytesOrNull(results[5][1])
            const spkPriv = toBytesOrNull(results[6][1])
            const spkSig = toBytesOrNull(results[7][1])
            if (spkPub && spkPriv && spkSig) {
                signedPreKey = {
                    keyId: Number(spkData.key_id),
                    keyPair: { pubKey: spkPub, privKey: spkPriv },
                    signature: spkSig,
                    uploaded: spkData.uploaded !== undefined ? spkData.uploaded === '1' : undefined
                }
            }
        }

        return {
            serverHasPreKeys,
            signedPreKeyRotationTs,
            registrationInfo,
            signedPreKey
        }
    }

    // ── Sessions ──────────────────────────────────────────────────────

    public async hasSession(address: SignalAddress): Promise<boolean> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        return (await this.redis.exists(key)) === 1
    }

    public async hasSessions(addresses: readonly SignalAddress[]): Promise<readonly boolean[]> {
        if (addresses.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const address of addresses) {
            const target = toSignalAddressParts(address)
            pipeline.exists(
                this.k(
                    'signal:sess',
                    this.sessionId,
                    target.user,
                    target.server,
                    String(target.device)
                )
            )
        }
        const results = await pipeline.exec()
        if (!results) return addresses.map(() => false)
        return results.map(([err, val]) => !err && val === 1)
    }

    public async getSession(address: SignalAddress): Promise<SignalSessionRecord | null> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        const data = await this.redis.getBuffer(key)
        if (!data) return null
        return decodeSignalSessionRecord(new Uint8Array(data))
    }

    public async getSessionsBatch(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (SignalSessionRecord | null)[]> {
        if (addresses.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const address of addresses) {
            const target = toSignalAddressParts(address)
            pipeline.getBuffer(
                this.k(
                    'signal:sess',
                    this.sessionId,
                    target.user,
                    target.server,
                    String(target.device)
                )
            )
        }
        const results = await pipeline.exec()
        if (!results) return addresses.map(() => null)
        return results.map(([err, data]) => {
            if (err || !data) return null
            return decodeSignalSessionRecord(new Uint8Array(data as Uint8Array))
        })
    }

    public async setSession(address: SignalAddress, session: SignalSessionRecord): Promise<void> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        const encoded = encodeSignalSessionRecord(session)
        await this.redis.set(key, toRedisBuffer(encoded))
    }

    public async setSessionsBatch(
        entries: readonly {
            readonly address: SignalAddress
            readonly session: SignalSessionRecord
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const pipeline = this.redis.pipeline()
        for (const entry of entries) {
            const target = toSignalAddressParts(entry.address)
            const key = this.k(
                'signal:sess',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
            const encoded = encodeSignalSessionRecord(entry.session)
            pipeline.set(key, toRedisBuffer(encoded))
        }
        await pipeline.exec()
    }

    public async deleteSession(address: SignalAddress): Promise<void> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:sess',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        await this.redis.del(key)
    }

    // ── Identities ────────────────────────────────────────────────────

    public async getRemoteIdentity(address: SignalAddress): Promise<Uint8Array | null> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:ident',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        const data = await this.redis.getBuffer(key)
        if (!data) return null
        return new Uint8Array(data)
    }

    public async getRemoteIdentities(
        addresses: readonly SignalAddress[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (addresses.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const address of addresses) {
            const target = toSignalAddressParts(address)
            pipeline.getBuffer(
                this.k(
                    'signal:ident',
                    this.sessionId,
                    target.user,
                    target.server,
                    String(target.device)
                )
            )
        }
        const results = await pipeline.exec()
        if (!results) return addresses.map(() => null)
        return results.map(([err, data]) => {
            if (err || !data) return null
            return new Uint8Array(data as Uint8Array)
        })
    }

    public async setRemoteIdentity(address: SignalAddress, identityKey: Uint8Array): Promise<void> {
        const target = toSignalAddressParts(address)
        const key = this.k(
            'signal:ident',
            this.sessionId,
            target.user,
            target.server,
            String(target.device)
        )
        await this.redis.set(key, toRedisBuffer(identityKey))
    }

    public async setRemoteIdentities(
        entries: readonly {
            readonly address: SignalAddress
            readonly identityKey: Uint8Array
        }[]
    ): Promise<void> {
        if (entries.length === 0) return
        const pipeline = this.redis.pipeline()
        for (const entry of entries) {
            const target = toSignalAddressParts(entry.address)
            const key = this.k(
                'signal:ident',
                this.sessionId,
                target.user,
                target.server,
                String(target.device)
            )
            pipeline.set(key, toRedisBuffer(entry.identityKey))
        }
        await pipeline.exec()
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        const patterns = [
            this.k('signal:meta', this.sessionId),
            this.k('signal:reg', this.sessionId),
            this.k('signal:spk', this.sessionId),
            this.k('signal:pk:ids', this.sessionId),
            this.k('signal:pk:avail', this.sessionId)
        ]
        const scanPatterns = [
            this.k('signal:reg', this.sessionId, '*'),
            this.k('signal:spk', this.sessionId, '*'),
            this.k('signal:pk', this.sessionId, '*'),
            this.k('signal:sess', this.sessionId, '*'),
            this.k('signal:ident', this.sessionId, '*')
        ]
        const scannedKeys = await Promise.all(scanPatterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = [...patterns, ...scannedKeys.flat()]
        if (allKeys.length > 0) {
            await this.redis.del(...allKeys)
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

    private async upsertPreKey(record: PreKeyRecord): Promise<void> {
        const idStr = String(record.keyId)
        const pkKey = this.k('signal:pk', this.sessionId, idStr)
        const idsKey = this.k('signal:pk:ids', this.sessionId)
        const availKey = this.k('signal:pk:avail', this.sessionId)
        const pipeline = this.redis.pipeline()
        pipeline.hset(pkKey, {
            uploaded: record.uploaded === true ? '1' : '0'
        })
        pipeline.set(
            this.k('signal:pk', this.sessionId, idStr, 'pub'),
            toRedisBuffer(record.keyPair.pubKey)
        )
        pipeline.set(
            this.k('signal:pk', this.sessionId, idStr, 'priv'),
            toRedisBuffer(record.keyPair.privKey)
        )
        pipeline.sadd(idsKey, idStr)
        if (record.uploaded !== true) {
            pipeline.zadd(availKey, record.keyId, idStr)
        } else {
            pipeline.zrem(availKey, idStr)
        }
        await pipeline.exec()
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
