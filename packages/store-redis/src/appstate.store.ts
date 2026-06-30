import {
    APP_STATE_EMPTY_LT_HASH,
    type AppStateCollectionName,
    decodeAppStateFingerprint,
    encodeAppStateFingerprint,
    keyEpoch,
    type WaAppStateStoreData,
    type WaAppStateSyncKey
} from 'zapo-js/appstate'
import type {
    WaAppStateCollectionStateUpdate,
    WaAppStateCollectionStoreState,
    WaAppStateStore
} from 'zapo-js/store'

import { BaseRedisStore } from './BaseRedisStore'
import {
    bytesToHex,
    deleteKeysChunked,
    hexToBytes,
    scanKeys,
    toBytesOrNull,
    toRedisBuffer,
    uint8Equal,
    uint8TimingSafeEqual
} from './helpers'
import type { WaRedisStorageOptions } from './types'

export class WaAppStateRedisStore extends BaseRedisStore implements WaAppStateStore {
    public constructor(options: WaRedisStorageOptions) {
        super(options)
    }

    public async exportData(): Promise<WaAppStateStoreData> {
        const keyPattern = this.k('appstate:key', this.sessionId, '*')
        const colPattern = this.k('appstate:col', this.sessionId, '*')
        const idxSetPattern = this.k('appstate:idx:set', this.sessionId, '*')

        const [keyKeys, colKeys, idxSetKeys] = await Promise.all([
            scanKeys(this.redis, keyPattern),
            scanKeys(this.redis, colPattern),
            scanKeys(this.redis, idxSetPattern)
        ])

        const keys: WaAppStateSyncKey[] = []
        if (keyKeys.length > 0) {
            // Filter out binary sub-keys (contain :data or :fp suffix)
            const hashKeys = keyKeys.filter((k) => {
                const afterPrefix = k.substring(this.k('appstate:key', this.sessionId, '').length)
                return !afterPrefix.includes(':')
            })

            if (hashKeys.length > 0) {
                const pipeline = this.redis.pipeline()
                for (const k of hashKeys) {
                    pipeline.hgetall(k)
                    const prefix = this.k('appstate:key', this.sessionId, '')
                    const keyIdHex = k.substring(prefix.length)
                    pipeline.getBuffer(this.k('appstate:key', this.sessionId, keyIdHex, 'data'))
                    pipeline.getBuffer(this.k('appstate:key', this.sessionId, keyIdHex, 'fp'))
                }
                const results = await pipeline.exec()
                if (results) {
                    for (let i = 0; i < hashKeys.length; i += 1) {
                        const base = i * 3
                        const [err, hashData] = results[base]
                        if (err || !hashData || typeof hashData !== 'object') continue
                        const record = hashData as Record<string, string>
                        if (Object.keys(record).length === 0) continue
                        const keyData = toBytesOrNull(results[base + 1][1])
                        if (!keyData) continue
                        const fingerprint = toBytesOrNull(results[base + 2][1])
                        keys.push({
                            keyId: hexToBytes(record.key_id_hex),
                            keyData,
                            timestamp: Number(record.timestamp),
                            fingerprint: decodeAppStateFingerprint(fingerprint)
                        })
                    }
                }
            }
        }

        const collections: WaAppStateStoreData['collections'] = {}
        if (colKeys.length > 0) {
            // Filter out binary sub-keys (contain :hash suffix)
            const hashColKeys = colKeys.filter((k) => {
                const afterPrefix = k.substring(this.k('appstate:col', this.sessionId, '').length)
                return !afterPrefix.includes(':')
            })

            if (hashColKeys.length > 0) {
                const pipeline = this.redis.pipeline()
                for (const k of hashColKeys) {
                    const prefix = this.k('appstate:col', this.sessionId, '')
                    const collection = k.substring(prefix.length)
                    pipeline.hgetall(k)
                    pipeline.getBuffer(this.k('appstate:col', this.sessionId, collection, 'hash'))
                }
                const results = await pipeline.exec()
                if (results) {
                    for (let i = 0; i < hashColKeys.length; i += 1) {
                        const base = i * 2
                        const [err, hashData] = results[base]
                        if (err || !hashData || typeof hashData !== 'object') continue
                        const record = hashData as Record<string, string>
                        if (Object.keys(record).length === 0) continue
                        const hashBytes = toBytesOrNull(results[base + 1][1])
                        if (!hashBytes) continue
                        const prefix = this.k('appstate:col', this.sessionId, '')
                        const collection = hashColKeys[i].substring(
                            prefix.length
                        ) as AppStateCollectionName
                        collections[collection] = {
                            version: Number(record.version),
                            hash: hashBytes,
                            indexValueMap: {}
                        }
                    }
                }
            }
        }

        if (idxSetKeys.length > 0) {
            for (const setKey of idxSetKeys) {
                const prefix = this.k('appstate:idx:set', this.sessionId, '')
                const collection = setKey.substring(prefix.length) as AppStateCollectionName
                const entry = collections[collection]
                if (!entry) continue

                const indexMacs = await this.redis.smembers(setKey)
                if (indexMacs.length === 0) continue

                const valuePipeline = this.redis.pipeline()
                for (const macHex of indexMacs) {
                    valuePipeline.getBuffer(
                        this.k('appstate:idx', this.sessionId, collection, macHex)
                    )
                }
                const valueResults = await valuePipeline.exec()
                if (valueResults) {
                    const map = entry.indexValueMap as Record<string, Uint8Array>
                    for (let j = 0; j < valueResults.length; j += 1) {
                        const [err, data] = valueResults[j]
                        if (err || !data) continue
                        map[indexMacs[j]] = new Uint8Array(data as Uint8Array)
                    }
                }
            }
        }

        return { keys, collections }
    }

    public async upsertSyncKeys(syncKeys: readonly WaAppStateSyncKey[]): Promise<number> {
        if (syncKeys.length === 0) return 0

        const idxKey = this.k('appstate:key:idx', this.sessionId)
        let inserted = 0

        const existingPipeline = this.redis.pipeline()
        for (const sk of syncKeys) {
            const keyIdHex = bytesToHex(sk.keyId)
            existingPipeline.getBuffer(this.k('appstate:key', this.sessionId, keyIdHex, 'data'))
        }
        const existingResults = await existingPipeline.exec()

        const writePipeline = this.redis.pipeline()
        const refreshUnchanged: string[] = []
        for (let i = 0; i < syncKeys.length; i += 1) {
            const sk = syncKeys[i]
            const keyIdHex = bytesToHex(sk.keyId)

            if (existingResults) {
                const [err, data] = existingResults[i]
                if (!err && data) {
                    const existingData = toBytesOrNull(data)
                    if (existingData && uint8Equal(existingData, sk.keyData)) {
                        refreshUnchanged.push(
                            this.k('appstate:key', this.sessionId, keyIdHex),
                            this.k('appstate:key', this.sessionId, keyIdHex, 'data'),
                            this.k('appstate:key', this.sessionId, keyIdHex, 'fp')
                        )
                        continue
                    }
                }
            }

            const hashKey = this.k('appstate:key', this.sessionId, keyIdHex)
            const dataKey = this.k('appstate:key', this.sessionId, keyIdHex, 'data')
            const epoch = keyEpoch(sk.keyId)
            writePipeline.hset(hashKey, {
                key_id_hex: keyIdHex,
                timestamp: String(sk.timestamp),
                key_epoch: String(epoch)
            })
            writePipeline.set(dataKey, toRedisBuffer(sk.keyData))
            const ttlKeys = [hashKey, dataKey, idxKey]
            const fingerprint = encodeAppStateFingerprint(sk.fingerprint)
            if (fingerprint) {
                const fpKey = this.k('appstate:key', this.sessionId, keyIdHex, 'fp')
                writePipeline.set(fpKey, toRedisBuffer(fingerprint))
                ttlKeys.push(fpKey)
            }
            writePipeline.zadd(idxKey, epoch, keyIdHex)
            this.touch(writePipeline, ttlKeys)
            inserted += 1
        }

        if (inserted > 0) {
            await writePipeline.exec()
        }
        if (refreshUnchanged.length > 0) {
            await this.refreshTtl([...refreshUnchanged, idxKey])
        }
        return inserted
    }

    public async getSyncKeysBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (WaAppStateSyncKey | null)[]> {
        if (keyIds.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const keyId of keyIds) {
            const keyIdHex = bytesToHex(keyId)
            pipeline.hgetall(this.k('appstate:key', this.sessionId, keyIdHex))
            pipeline.getBuffer(this.k('appstate:key', this.sessionId, keyIdHex, 'data'))
            pipeline.getBuffer(this.k('appstate:key', this.sessionId, keyIdHex, 'fp'))
        }
        const results = await pipeline.exec()
        if (!results) return keyIds.map(() => null)

        const out = keyIds.map((keyId, index) => {
            const base = index * 3
            const [err, hashData] = results[base]
            if (err || !hashData || typeof hashData !== 'object') return null
            const record = hashData as Record<string, string>
            if (Object.keys(record).length === 0) return null
            const keyData = toBytesOrNull(results[base + 1][1])
            if (!keyData) return null
            const fingerprint = toBytesOrNull(results[base + 2][1])
            return {
                keyId,
                keyData,
                timestamp: Number(record.timestamp),
                fingerprint: decodeAppStateFingerprint(fingerprint)
            }
        })
        const refreshKeys: string[] = []
        for (let index = 0; index < keyIds.length; index += 1) {
            if (out[index] === null) continue
            const keyIdHex = bytesToHex(keyIds[index])
            refreshKeys.push(
                this.k('appstate:key', this.sessionId, keyIdHex),
                this.k('appstate:key', this.sessionId, keyIdHex, 'data'),
                this.k('appstate:key', this.sessionId, keyIdHex, 'fp')
            )
        }
        if (refreshKeys.length > 0) {
            refreshKeys.push(this.k('appstate:key:idx', this.sessionId))
        }
        await this.refreshTtl(refreshKeys)
        return out
    }

    public async getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        const keyIdHex = bytesToHex(keyId)
        const binKey = this.k('appstate:key', this.sessionId, keyIdHex, 'data')
        const raw = await this.redis.getBuffer(binKey)
        if (!raw) return null
        await this.refreshTtl([
            this.k('appstate:key', this.sessionId, keyIdHex),
            binKey,
            this.k('appstate:key', this.sessionId, keyIdHex, 'fp'),
            this.k('appstate:key:idx', this.sessionId)
        ])
        return new Uint8Array(raw)
    }

    public async getSyncKeyDataBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (keyIds.length === 0) return []
        const pipeline = this.redis.pipeline()
        for (const keyId of keyIds) {
            pipeline.getBuffer(this.k('appstate:key', this.sessionId, bytesToHex(keyId), 'data'))
        }
        const results = await pipeline.exec()
        if (!results) return keyIds.map(() => null)
        const out = results.map(([err, data]) => {
            if (err || !data) return null
            return new Uint8Array(data as Uint8Array)
        })
        const refreshKeys: string[] = []
        for (let index = 0; index < keyIds.length; index += 1) {
            if (out[index] === null) continue
            const keyIdHex = bytesToHex(keyIds[index])
            refreshKeys.push(
                this.k('appstate:key', this.sessionId, keyIdHex),
                this.k('appstate:key', this.sessionId, keyIdHex, 'data'),
                this.k('appstate:key', this.sessionId, keyIdHex, 'fp')
            )
        }
        if (refreshKeys.length > 0) {
            refreshKeys.push(this.k('appstate:key:idx', this.sessionId))
        }
        await this.refreshTtl(refreshKeys)
        return out
    }

    public async getActiveSyncKey(): Promise<WaAppStateSyncKey | null> {
        const idxKey = this.k('appstate:key:idx', this.sessionId)
        const members = await this.redis.zrevrange(idxKey, 0, -1)

        for (const keyIdHex of members) {
            const hashKey = this.k('appstate:key', this.sessionId, keyIdHex)
            const dataKey = this.k('appstate:key', this.sessionId, keyIdHex, 'data')
            const fpKey = this.k('appstate:key', this.sessionId, keyIdHex, 'fp')
            const pipeline = this.redis.pipeline()
            pipeline.hgetall(hashKey)
            pipeline.getBuffer(dataKey)
            pipeline.getBuffer(fpKey)
            const results = await pipeline.exec()
            if (!results) return null

            const [err, hashData] = results[0]
            const data =
                !err && hashData && typeof hashData === 'object'
                    ? (hashData as Record<string, string>)
                    : null
            const keyData =
                data && Object.keys(data).length > 0 ? toBytesOrNull(results[1][1]) : null
            if (!data || !keyData) {
                await this.redis.zrem(idxKey, keyIdHex)
                continue
            }
            const fingerprint = toBytesOrNull(results[2][1])

            await this.refreshTtl([idxKey, hashKey, dataKey, fpKey])

            return {
                keyId: hexToBytes(keyIdHex),
                keyData,
                timestamp: Number(data.timestamp),
                fingerprint: decodeAppStateFingerprint(fingerprint)
            }
        }
        return null
    }

    public async getCollectionState(
        collection: AppStateCollectionName
    ): Promise<WaAppStateCollectionStoreState> {
        const colKey = this.k('appstate:col', this.sessionId, collection)
        const pipeline = this.redis.pipeline()
        pipeline.hgetall(colKey)
        pipeline.getBuffer(this.k('appstate:col', this.sessionId, collection, 'hash'))
        const results = await pipeline.exec()

        if (!results) {
            return {
                initialized: false,
                version: 0,
                hash: APP_STATE_EMPTY_LT_HASH,
                indexValueMap: new Map()
            }
        }

        const [hashErr, hashData] = results[0]
        const data = hashData as Record<string, string>
        if (hashErr || !data || Object.keys(data).length === 0) {
            return {
                initialized: false,
                version: 0,
                hash: APP_STATE_EMPTY_LT_HASH,
                indexValueMap: new Map()
            }
        }

        const hashBytes = toBytesOrNull(results[1][1])
        if (!hashBytes) {
            return {
                initialized: false,
                version: 0,
                hash: APP_STATE_EMPTY_LT_HASH,
                indexValueMap: new Map()
            }
        }

        const idxSetKey = this.k('appstate:idx:set', this.sessionId, collection)
        const indexMacs = await this.redis.smembers(idxSetKey)
        const indexValueMap = new Map<string, Uint8Array>()

        if (indexMacs.length > 0) {
            const idxPipeline = this.redis.pipeline()
            for (const macHex of indexMacs) {
                idxPipeline.getBuffer(this.k('appstate:idx', this.sessionId, collection, macHex))
            }
            const idxResults = await idxPipeline.exec()
            if (idxResults) {
                for (let i = 0; i < idxResults.length; i += 1) {
                    const [err, val] = idxResults[i]
                    if (err || !val) continue
                    indexValueMap.set(indexMacs[i], new Uint8Array(val as Uint8Array))
                }
            }
        }

        await this.refreshTtl([
            colKey,
            this.k('appstate:col', this.sessionId, collection, 'hash'),
            idxSetKey,
            ...indexMacs.map((macHex) => this.k('appstate:idx', this.sessionId, collection, macHex))
        ])

        return {
            initialized: true,
            version: Number(data.version),
            hash: hashBytes,
            indexValueMap
        }
    }

    public async getCollectionStates(
        collections: readonly AppStateCollectionName[]
    ): Promise<readonly WaAppStateCollectionStoreState[]> {
        if (collections.length === 0) return []
        const results: WaAppStateCollectionStoreState[] = []
        for (const collection of collections) {
            results.push(await this.getCollectionState(collection))
        }
        return results
    }

    public async setCollectionStates(
        updates: readonly WaAppStateCollectionStateUpdate[]
    ): Promise<void> {
        if (updates.length === 0) return

        for (const update of updates) {
            const colKey = this.k('appstate:col', this.sessionId, update.collection)
            const idxSetKey = this.k('appstate:idx:set', this.sessionId, update.collection)
            const buildIdxKey = (macHex: string): string =>
                this.k('appstate:idx', this.sessionId, update.collection, macHex)

            const oldMacs = await this.redis.smembers(idxSetKey)
            const oldMacSet = new Set(oldMacs)
            const oldValues = new Map<string, Uint8Array>()
            if (oldMacs.length > 0) {
                const readPipeline = this.redis.pipeline()
                for (const macHex of oldMacs) {
                    readPipeline.getBuffer(buildIdxKey(macHex))
                }
                const results = await readPipeline.exec()
                if (results) {
                    for (let i = 0; i < results.length; i += 1) {
                        const value = toBytesOrNull(results[i][1])
                        if (value) {
                            oldValues.set(oldMacs[i], value)
                        }
                    }
                }
            }

            const colHashKey = this.k('appstate:col', this.sessionId, update.collection, 'hash')
            const multi = this.redis.multi()
            multi.hset(colKey, {
                version: String(update.version)
            })
            multi.set(colHashKey, toRedisBuffer(update.hash))

            const addMacs: string[] = []
            for (const [indexMacHex, valueMac] of update.indexValueMap.entries()) {
                const current = oldValues.get(indexMacHex)
                if (!current || !uint8TimingSafeEqual(current, valueMac)) {
                    multi.set(buildIdxKey(indexMacHex), toRedisBuffer(valueMac))
                }
                if (!oldMacSet.has(indexMacHex)) {
                    addMacs.push(indexMacHex)
                }
            }
            const delMacs: string[] = []
            for (const macHex of oldMacs) {
                if (!update.indexValueMap.has(macHex)) {
                    multi.del(buildIdxKey(macHex))
                    delMacs.push(macHex)
                }
            }
            if (addMacs.length > 0) {
                multi.sadd(idxSetKey, ...addMacs)
            }
            if (delMacs.length > 0) {
                multi.srem(idxSetKey, ...delMacs)
            }

            this.touch(multi, [
                colKey,
                colHashKey,
                idxSetKey,
                ...[...update.indexValueMap.keys()].map(buildIdxKey)
            ])

            await multi.exec()
        }
    }

    public async clear(): Promise<void> {
        const fixedKeys = [this.k('appstate:key:idx', this.sessionId)]
        const scanPatterns = [
            this.k('appstate:key', this.sessionId, '*'),
            this.k('appstate:col', this.sessionId, '*'),
            this.k('appstate:idx', this.sessionId, '*'),
            this.k('appstate:idx:set', this.sessionId, '*')
        ]

        const scannedKeys = await Promise.all(scanPatterns.map((p) => scanKeys(this.redis, p)))
        const allKeys = [...fixedKeys, ...scannedKeys.flat()]
        if (allKeys.length > 0) {
            await deleteKeysChunked(this.redis, allKeys)
        }
    }
}
