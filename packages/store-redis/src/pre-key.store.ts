import type { KyberPreKeyRecord, PreKeyRecord } from 'zapo-js/signal'
import type { WaPqPreKeyStore, WaPreKeyStore } from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import { deleteKeysChunked, safeLimit, scanKeys, toRedisBuffer } from './helpers'
import type { WaRedisStorageOptions } from './types'

/** Kyber pre-key ids are 3 bytes on the wire; the id counter wraps just before 2^24. */
const KYBER_PREKEY_ID_BORDER = 16_777_215

const LUA_CONSUME_PREKEY = `
local hashKey = KEYS[1]
local idsKey = KEYS[2]
local availKey = KEYS[3]
local keyId = ARGV[1]
local data = redis.call('HGETALL', hashKey)
if #data == 0 then
    return nil
end
redis.call('DEL', hashKey)
redis.call('SREM', idsKey, keyId)
redis.call('ZREM', availKey, keyId)
return data
`

const LUA_CONSUME_KYBER_PREKEY = `
local data = redis.call('HGETALL', KEYS[1])
if #data == 0 then
    return nil
end
for i = 1, #data, 2 do
    if data[i] == 'lastresort' and data[i + 1] == '1' then
        return data
    end
end
redis.call('DEL', KEYS[1])
return data
`

const LUA_SET_IF_GREATER = `
local metaKey = KEYS[1]
local field = ARGV[1]
local newVal = tonumber(ARGV[2])
local cur = tonumber(redis.call('HGET', metaKey, field) or '0')
if newVal > cur then
    redis.call('HSET', metaKey, field, tostring(newVal))
end
return 1
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

const LUA_RESERVE_KYBER_PREKEY_IDS = `
local metaKey = KEYS[1]
local count = tonumber(ARGV[1])
local border = tonumber(ARGV[2])
local first = tonumber(redis.call('HGET', metaKey, 'next_kyber_prekey_id') or '1')
redis.call('HSET', metaKey, 'next_kyber_prekey_id', tostring((first + count) % border))
return first
`

export class WaPreKeyRedisStore extends BaseRedisStore implements WaPreKeyStore, WaPqPreKeyStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    // ── PreKeys ───────────────────────────────────────────────────────

    public async putPreKey(record: PreKeyRecord): Promise<void> {
        await this.ensureMetaHash()
        await this.upsertPreKey(record)
        const metaKey = this.k('signal:meta', this.sessionId)
        await this.redis.eval(
            LUA_SET_IF_GREATER,
            1,
            metaKey,
            'next_prekey_id',
            String(record.keyId + 1)
        )
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
                    pipeline.hgetallBuffer(this.k('signal:pk', this.sessionId, id))
                }
                const results = await pipeline.exec()
                if (results) {
                    for (let i = 0; i < availableIds.length; i += 1) {
                        const [err, data] = results[i]
                        if (err || !data) continue
                        const record = this.decodePreKey(
                            Number(availableIds[i]),
                            data as Record<string, Buffer>
                        )
                        if (record) available.push(record)
                    }
                }
                await this.refreshTtl([
                    ...availableIds.map((id) => this.k('signal:pk', this.sessionId, id)),
                    availKey
                ])
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
            const idStrs: string[] = []
            for (const record of generated) {
                const idStr = String(record.keyId)
                idStrs.push(idStr)
                const pkKey = this.k('signal:pk', this.sessionId, idStr)
                ;(pipeline.hset as (...args: unknown[]) => unknown)(
                    pkKey,
                    'uploaded',
                    record.uploaded === true ? '1' : '0',
                    'pub',
                    toRedisBuffer(record.keyPair.pubKey),
                    'priv',
                    toRedisBuffer(record.keyPair.privKey)
                )
                if (record.uploaded !== true) {
                    pipeline.zadd(availKey, record.keyId, idStr)
                }
            }
            this.touch(pipeline, [
                ...idStrs.map((id) => this.k('signal:pk', this.sessionId, id)),
                availKey
            ])
            // One variadic SADD (the last command) returns how many ids were
            // genuinely new, i.e. how many prekeys this round actually inserted.
            pipeline.sadd(idsKey, ...idStrs)
            const execResults = await pipeline.exec()
            await this.refreshTtl([idsKey])
            const saddResult = execResults ? execResults[execResults.length - 1] : undefined
            const insertedCount =
                saddResult && saddResult[0] === null && typeof saddResult[1] === 'number'
                    ? saddResult[1]
                    : 0
            // Atomically reconcile if the generator produced IDs beyond the reserved range
            if (maxId + 1 > reservedIds[reservedIds.length - 1] + 1) {
                await this.redis.eval(
                    LUA_SET_IF_GREATER,
                    1,
                    metaKey,
                    'next_prekey_id',
                    String(maxId + 1)
                )
            }

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
                    fetchPipeline.hgetallBuffer(this.k('signal:pk', this.sessionId, id))
                }
                const fetchResults = await fetchPipeline.exec()
                const finalKeys: PreKeyRecord[] = []
                if (fetchResults) {
                    for (let i = 0; i < Math.min(recheckIds.length, count); i += 1) {
                        const [err, data] = fetchResults[i]
                        if (err || !data) continue
                        const record = this.decodePreKey(
                            Number(recheckIds[i]),
                            data as Record<string, Buffer>
                        )
                        if (record) finalKeys.push(record)
                    }
                }
                if (finalKeys.length >= count) {
                    return finalKeys.slice(0, count)
                }
            }
            // No new ids: the generator returned already-stored key ids. Bail
            // instead of looping; robust to a concurrent consume.
            if (insertedCount === 0) {
                throw new Error(
                    'getOrGenPreKeys made no progress; the generator returned key ids ' +
                        'that collide with stored prekeys'
                )
            }
        }
    }

    public async getPreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        const pkKey = this.k('signal:pk', this.sessionId, String(keyId))
        const data = await this.redis.hgetallBuffer(pkKey)
        const record = this.decodePreKey(keyId, data)
        if (record) await this.refreshTtl([pkKey])
        return record
    }

    public async getPreKeysById(
        keyIds: readonly number[]
    ): Promise<readonly (PreKeyRecord | null)[]> {
        if (keyIds.length === 0) return []
        // One HGETALL per key — still pipelined into 1 round-trip but each
        // key is a single hash (vs 3 separate redis keys before).
        const pipeline = this.redis.pipeline()
        for (const keyId of keyIds) {
            pipeline.hgetallBuffer(this.k('signal:pk', this.sessionId, String(keyId)))
        }
        const results = await pipeline.exec()
        if (!results) return keyIds.map(() => null)
        const out = keyIds.map((keyId, index) => {
            const [err, data] = results[index]
            if (err || !data) return null
            return this.decodePreKey(keyId, data as Record<string, Buffer>)
        })
        await this.refreshTtl(
            keyIds
                .filter((_keyId, index) => out[index] !== null)
                .map((keyId) => this.k('signal:pk', this.sessionId, String(keyId)))
        )
        return out
    }

    public async consumePreKeyById(keyId: number): Promise<PreKeyRecord | null> {
        const idStr = String(keyId)
        const hashKey = this.k('signal:pk', this.sessionId, idStr)
        const idsKey = this.k('signal:pk:ids', this.sessionId)
        const availKey = this.k('signal:pk:avail', this.sessionId)

        // Single Lua script atomically returns the hash contents (binary
        // pub/priv included) and removes the prekey from all indexes.
        // evalBuffer keeps the byte fields intact across the round-trip.
        const raw = await (
            this.redis as unknown as {
                evalBuffer: (...args: unknown[]) => Promise<Buffer[] | null>
            }
        ).evalBuffer(LUA_CONSUME_PREKEY, 3, hashKey, idsKey, availKey, idStr)
        if (!raw || raw.length === 0) return null

        const data: Record<string, Buffer> = {}
        for (let i = 0; i < raw.length; i += 2) {
            data[raw[i].toString()] = raw[i + 1]
        }
        return this.decodePreKey(keyId, data)
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
        const touchedKeys: string[] = []
        for (const idStr of allIds) {
            const id = Number(idStr)
            if (id <= keyId) {
                const pkKey = this.k('signal:pk', this.sessionId, idStr)
                pipeline.hset(pkKey, 'uploaded', '1')
                pipeline.zrem(availKey, idStr)
                touchedKeys.push(pkKey)
            }
        }
        if (touchedKeys.length > 0) {
            this.touch(pipeline, [...touchedKeys, availKey])
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

    // ── Kyber PreKeys ─────────────────────────────────────────────────

    public async putKyberPreKeys(records: readonly KyberPreKeyRecord[]): Promise<void> {
        if (records.length === 0) return
        const pipeline = this.redis.pipeline()
        const touchedKeys: string[] = []
        const lastResortKey = this.k('signal:kyberlr', this.sessionId)
        for (const record of records) {
            const kyberKey = this.k('signal:kyberprekey', this.sessionId, String(record.keyId))
            // Single hash mixing string flags + binary fields, mirroring the
            // classic prekey hash. ioredis accepts Buffer values in variadic HSET.
            ;(pipeline.hset as (...args: unknown[]) => unknown)(
                kyberKey,
                'lastresort',
                record.lastResort === true ? '1' : '0',
                'pub',
                toRedisBuffer(record.keyPair.pubKey),
                'priv',
                toRedisBuffer(record.keyPair.privKey),
                'sig',
                toRedisBuffer(record.signature)
            )
            touchedKeys.push(kyberKey)
            if (record.lastResort === true) {
                pipeline.zadd(lastResortKey, record.keyId, String(record.keyId))
                touchedKeys.push(lastResortKey)
            } else {
                pipeline.zrem(lastResortKey, String(record.keyId))
            }
        }
        this.touch(pipeline, touchedKeys)
        await pipeline.exec()
    }

    public async getKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        const kyberKey = this.k('signal:kyberprekey', this.sessionId, String(keyId))
        const data = await this.redis.hgetallBuffer(kyberKey)
        const record = this.decodeKyberPreKey(keyId, data)
        if (record) await this.refreshKyberTtl(kyberKey, record)
        return record
    }

    public async consumeKyberPreKeyById(keyId: number): Promise<KyberPreKeyRecord | null> {
        const kyberKey = this.k('signal:kyberprekey', this.sessionId, String(keyId))
        // One script reads the hash and deletes it unless it is a last-resort
        // key, so concurrent callers cannot both receive a one-time key.
        const raw = await (
            this.redis as unknown as {
                evalBuffer: (...args: unknown[]) => Promise<Buffer[] | null>
            }
        ).evalBuffer(LUA_CONSUME_KYBER_PREKEY, 1, kyberKey)
        if (!raw || raw.length === 0) return null

        const data: Record<string, Buffer> = {}
        for (let i = 0; i < raw.length; i += 2) {
            data[raw[i].toString()] = raw[i + 1]
        }
        const record = this.decodeKyberPreKey(keyId, data)
        if (record?.lastResort === true) await this.refreshKyberTtl(kyberKey, record)
        return record
    }

    public async removeKyberPreKeys(keyIds: readonly number[]): Promise<void> {
        if (keyIds.length === 0) return
        const lastResortKey = this.k('signal:kyberlr', this.sessionId)
        const pipeline = this.redis.pipeline()
        for (const keyId of new Set(keyIds)) {
            pipeline.del(this.k('signal:kyberprekey', this.sessionId, String(keyId)))
            pipeline.zrem(lastResortKey, String(keyId))
        }
        await pipeline.exec()
    }

    public async getLatestKyberLastResortKey(): Promise<KyberPreKeyRecord | null> {
        const lastResortKey = this.k('signal:kyberlr', this.sessionId)
        for (const latest of await this.redis.zrevrange(lastResortKey, 0, -1)) {
            const kyberKey = this.k('signal:kyberprekey', this.sessionId, latest)
            const record = this.decodeKyberPreKey(
                Number(latest),
                await this.redis.hgetallBuffer(kyberKey)
            )
            if (record) {
                await this.refreshTtl([kyberKey, lastResortKey])
                return record
            }
        }
        return null
    }

    public async reserveKyberPreKeyIds(count: number): Promise<number> {
        if (!Number.isSafeInteger(count) || count <= 0) {
            throw new Error(`invalid kyber prekey count: ${count}`)
        }
        await this.ensureMetaHash()
        const first = await this.redis.eval(
            LUA_RESERVE_KYBER_PREKEY_IDS,
            1,
            this.k('signal:meta', this.sessionId),
            String(count),
            String(KYBER_PREKEY_ID_BORDER)
        )
        return Number(first)
    }

    public async getPqMigrated(): Promise<boolean> {
        const raw = await this.redis.hget(this.k('signal:meta', this.sessionId), 'pq_migrated')
        return raw === '1'
    }

    public async setPqMigrated(value: boolean): Promise<void> {
        await this.ensureMetaHash()
        await this.redis.hset(
            this.k('signal:meta', this.sessionId),
            'pq_migrated',
            value ? '1' : '0'
        )
    }

    // ── Clear ─────────────────────────────────────────────────────────

    public async clear(): Promise<void> {
        const patterns = [
            this.k('signal:pk:ids', this.sessionId),
            this.k('signal:pk:avail', this.sessionId),
            this.k('signal:kyberlr', this.sessionId)
        ]
        const scanPatterns = [
            this.k('signal:pk', this.sessionId, '*'),
            this.k('signal:kyberprekey', this.sessionId, '*')
        ]
        const scannedKeys = await Promise.all(scanPatterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = [...patterns, ...scannedKeys.flat()]
        if (allKeys.length > 0) {
            await deleteKeysChunked(this.redis, allKeys)
        }
        const metaKey = this.k('signal:meta', this.sessionId)
        await this.redis.hmset(metaKey, {
            server_has_prekeys: '0',
            next_prekey_id: '1',
            next_kyber_prekey_id: '1',
            pq_migrated: '0'
        })
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

    private decodePreKey(
        keyId: number,
        data: Record<string, Buffer> | null | undefined
    ): PreKeyRecord | null {
        if (!data) return null
        const pub = data.pub
        const priv = data.priv
        if (!pub || !priv) return null
        const uploadedRaw = data.uploaded
        return {
            keyId,
            keyPair: { pubKey: new Uint8Array(pub), privKey: new Uint8Array(priv) },
            uploaded: uploadedRaw ? uploadedRaw.toString() === '1' : undefined
        }
    }

    /** Last-resort records are found through the index, so it lives as long as the key. */
    private async refreshKyberTtl(kyberKey: string, record: KyberPreKeyRecord): Promise<void> {
        await this.refreshTtl(
            record.lastResort === true
                ? [kyberKey, this.k('signal:kyberlr', this.sessionId)]
                : [kyberKey]
        )
    }

    private decodeKyberPreKey(
        keyId: number,
        data: Record<string, Buffer> | null | undefined
    ): KyberPreKeyRecord | null {
        if (!data) return null
        const pub = data.pub
        const priv = data.priv
        const sig = data.sig
        if (!pub || !priv || !sig) return null
        const lastResortRaw = data.lastresort
        return {
            keyId,
            keyPair: { pubKey: new Uint8Array(pub), privKey: new Uint8Array(priv) },
            signature: new Uint8Array(sig),
            lastResort: lastResortRaw ? lastResortRaw.toString() === '1' : undefined
        }
    }

    private async upsertPreKey(record: PreKeyRecord): Promise<void> {
        const idStr = String(record.keyId)
        const pkKey = this.k('signal:pk', this.sessionId, idStr)
        const idsKey = this.k('signal:pk:ids', this.sessionId)
        const availKey = this.k('signal:pk:avail', this.sessionId)
        const pipeline = this.redis.pipeline()
        // Single hash with mixed string + binary fields. ioredis accepts
        // Buffer values in the variadic HSET form.
        ;(pipeline.hset as (...args: unknown[]) => unknown)(
            pkKey,
            'uploaded',
            record.uploaded === true ? '1' : '0',
            'pub',
            toRedisBuffer(record.keyPair.pubKey),
            'priv',
            toRedisBuffer(record.keyPair.privKey)
        )
        pipeline.sadd(idsKey, idStr)
        if (record.uploaded !== true) {
            pipeline.zadd(availKey, record.keyId, idStr)
        } else {
            pipeline.zrem(availKey, idStr)
        }
        this.touch(pipeline, [pkKey, idsKey, availKey])
        await pipeline.exec()
    }
}
