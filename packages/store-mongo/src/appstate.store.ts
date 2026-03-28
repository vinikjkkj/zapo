import type { AnyBulkWriteOperation, Binary } from 'mongodb'
import type {
    AppStateCollectionName,
    WaAppStateSyncKey,
    WaAppStateStoreData
} from 'zapo-js/appstate'
import {
    APP_STATE_EMPTY_LT_HASH,
    encodeAppStateFingerprint,
    decodeAppStateFingerprint,
    keyEpoch
} from 'zapo-js/appstate'
import type {
    WaAppStateStore,
    WaAppStateCollectionStoreState,
    WaAppStateCollectionStateUpdate
} from 'zapo-js/store'

import { BaseMongoStore } from './BaseMongoStore'
import { fromBinary, fromBinaryOrNull, toBinary, bytesToHex, uint8Equal } from './helpers'
import type { WaMongoStorageOptions } from './types'

interface SyncKeyDoc {
    _id: { session_id: string; key_id: Binary }
    key_data: Binary
    timestamp: number
    fingerprint: Binary | null
    key_epoch: number
}

interface CollectionVersionDoc {
    _id: { session_id: string; collection: string }
    version: number
    hash: Binary
}

interface IndexValueDoc {
    _id: { session_id: string; collection: string; index_mac_hex: string }
    value_mac: Binary
}

export class WaAppStateMongoStore extends BaseMongoStore implements WaAppStateStore {
    public constructor(options: WaMongoStorageOptions) {
        super(options)
    }

    protected override async createIndexes(): Promise<void> {
        const syncKeys = this.col<SyncKeyDoc>('appstate_sync_keys')
        await syncKeys.createIndex({ '_id.session_id': 1, key_epoch: -1 })
    }

    public async exportData(): Promise<WaAppStateStoreData> {
        return this.withSession(async (session) => {
            const syncKeysCol = this.col<SyncKeyDoc>('appstate_sync_keys')
            const versionsCol = this.col<CollectionVersionDoc>('appstate_collection_versions')
            const valuesCol = this.col<IndexValueDoc>('appstate_collection_index_values')

            const [keyDocs, versionDocs, valueDocs] = await Promise.all([
                syncKeysCol.find({ '_id.session_id': this.sessionId }, { session }).toArray(),
                versionsCol.find({ '_id.session_id': this.sessionId }, { session }).toArray(),
                valuesCol.find({ '_id.session_id': this.sessionId }, { session }).toArray()
            ])

            const keys: WaAppStateSyncKey[] = keyDocs.map((doc) => ({
                keyId: fromBinary(doc._id.key_id),
                keyData: fromBinary(doc.key_data),
                timestamp: doc.timestamp,
                fingerprint: decodeAppStateFingerprint(fromBinaryOrNull(doc.fingerprint))
            }))

            const collections: WaAppStateStoreData['collections'] = {}
            for (const doc of versionDocs) {
                const name = doc._id.collection as AppStateCollectionName
                collections[name] = {
                    version: doc.version,
                    hash: fromBinary(doc.hash),
                    indexValueMap: {}
                }
            }
            for (const doc of valueDocs) {
                const name = doc._id.collection as AppStateCollectionName
                const entry = collections[name]
                if (entry) {
                    ;(entry.indexValueMap as Record<string, Uint8Array>)[doc._id.index_mac_hex] =
                        fromBinary(doc.value_mac)
                }
            }

            return { keys, collections }
        })
    }

    public async upsertSyncKeys(keys: readonly WaAppStateSyncKey[]): Promise<number> {
        if (keys.length === 0) return 0
        await this.ensureIndexes()
        const col = this.col<SyncKeyDoc>('appstate_sync_keys')

        const keyIds = keys.map((k) => toBinary(k.keyId))
        const existingDocs = await col
            .find({
                '_id.session_id': this.sessionId,
                '_id.key_id': { $in: keyIds }
            })
            .toArray()
        const existingByHex = new Map<string, Uint8Array>()
        for (const doc of existingDocs) {
            existingByHex.set(bytesToHex(fromBinary(doc._id.key_id)), fromBinary(doc.key_data))
        }

        let inserted = 0
        const ops: AnyBulkWriteOperation<SyncKeyDoc>[] = []
        for (const key of keys) {
            const existing = existingByHex.get(bytesToHex(key.keyId))
            if (existing && uint8Equal(existing, key.keyData)) {
                continue
            }
            const fp = key.fingerprint ? encodeAppStateFingerprint(key.fingerprint) : null
            ops.push({
                updateOne: {
                    filter: {
                        _id: { session_id: this.sessionId, key_id: toBinary(key.keyId) }
                    },
                    update: {
                        $set: {
                            key_data: toBinary(key.keyData),
                            timestamp: key.timestamp,
                            fingerprint: fp ? toBinary(fp) : null,
                            key_epoch: keyEpoch(key.keyId)
                        }
                    },
                    upsert: true
                }
            })
            inserted += 1
        }
        if (ops.length > 0) {
            await col.bulkWrite(ops)
        }
        return inserted
    }

    public async getSyncKeysBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (WaAppStateSyncKey | null)[]> {
        if (keyIds.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<SyncKeyDoc>('appstate_sync_keys')
        const binaryIds = keyIds.map((k) => toBinary(k))
        const docs = await col
            .find({
                '_id.session_id': this.sessionId,
                '_id.key_id': { $in: binaryIds }
            })
            .toArray()
        const byHex = new Map<string, WaAppStateSyncKey>()
        for (const doc of docs) {
            const keyId = fromBinary(doc._id.key_id)
            byHex.set(bytesToHex(keyId), {
                keyId,
                keyData: fromBinary(doc.key_data),
                timestamp: doc.timestamp,
                fingerprint: decodeAppStateFingerprint(fromBinaryOrNull(doc.fingerprint))
            })
        }
        return keyIds.map((id) => byHex.get(bytesToHex(id)) ?? null)
    }

    public async getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        await this.ensureIndexes()
        const col = this.col<SyncKeyDoc>('appstate_sync_keys')
        const doc = await col.findOne({
            _id: { session_id: this.sessionId, key_id: toBinary(keyId) }
        })
        if (!doc) return null
        return fromBinary(doc.key_data)
    }

    public async getSyncKeyDataBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (keyIds.length === 0) return []
        await this.ensureIndexes()
        const col = this.col<SyncKeyDoc>('appstate_sync_keys')
        const binaryIds = keyIds.map((k) => toBinary(k))
        const docs = await col
            .find({
                '_id.session_id': this.sessionId,
                '_id.key_id': { $in: binaryIds }
            })
            .toArray()
        const byHex = new Map<string, Uint8Array>()
        for (const doc of docs) {
            byHex.set(bytesToHex(fromBinary(doc._id.key_id)), fromBinary(doc.key_data))
        }
        return keyIds.map((id) => byHex.get(bytesToHex(id)) ?? null)
    }

    public async getActiveSyncKey(): Promise<WaAppStateSyncKey | null> {
        await this.ensureIndexes()
        const col = this.col<SyncKeyDoc>('appstate_sync_keys')
        const docs = await col
            .find({ '_id.session_id': this.sessionId })
            .sort({ key_epoch: -1, '_id.key_id': 1 })
            .limit(1)
            .toArray()
        if (docs.length === 0) return null
        const doc = docs[0]
        return {
            keyId: fromBinary(doc._id.key_id),
            keyData: fromBinary(doc.key_data),
            timestamp: doc.timestamp,
            fingerprint: decodeAppStateFingerprint(fromBinaryOrNull(doc.fingerprint))
        }
    }

    public async getCollectionState(
        collection: AppStateCollectionName
    ): Promise<WaAppStateCollectionStoreState> {
        return this.withSession(async (session) => {
            const versionsCol = this.col<CollectionVersionDoc>('appstate_collection_versions')
            const valuesCol = this.col<IndexValueDoc>('appstate_collection_index_values')

            const versionDoc = await versionsCol.findOne(
                { _id: { session_id: this.sessionId, collection } },
                { session }
            )
            if (!versionDoc) {
                return {
                    initialized: false,
                    version: 0,
                    hash: APP_STATE_EMPTY_LT_HASH,
                    indexValueMap: new Map()
                }
            }

            const valueDocs = await valuesCol
                .find(
                    {
                        '_id.session_id': this.sessionId,
                        '_id.collection': collection
                    },
                    { session }
                )
                .toArray()
            const indexValueMap = new Map<string, Uint8Array>()
            for (const doc of valueDocs) {
                indexValueMap.set(doc._id.index_mac_hex, fromBinary(doc.value_mac))
            }

            return {
                initialized: true,
                version: versionDoc.version,
                hash: fromBinary(versionDoc.hash),
                indexValueMap
            }
        })
    }

    public async getCollectionStates(
        collections: readonly AppStateCollectionName[]
    ): Promise<readonly WaAppStateCollectionStoreState[]> {
        if (collections.length === 0) return []
        return this.withSession(async (session) => {
            const versionsCol = this.col<CollectionVersionDoc>('appstate_collection_versions')
            const valuesCol = this.col<IndexValueDoc>('appstate_collection_index_values')
            const uniqueCollections = [...new Set(collections)]

            const [versionDocs, valueDocs] = await Promise.all([
                versionsCol
                    .find(
                        {
                            '_id.session_id': this.sessionId,
                            '_id.collection': { $in: uniqueCollections }
                        },
                        { session }
                    )
                    .toArray(),
                valuesCol
                    .find(
                        {
                            '_id.session_id': this.sessionId,
                            '_id.collection': { $in: uniqueCollections }
                        },
                        { session }
                    )
                    .toArray()
            ])

            const versionsByCollection = new Map<
                AppStateCollectionName,
                { version: number; hash: Uint8Array }
            >()
            for (const doc of versionDocs) {
                const name = doc._id.collection as AppStateCollectionName
                versionsByCollection.set(name, {
                    version: doc.version,
                    hash: fromBinary(doc.hash)
                })
            }

            const indexValueMaps = new Map<AppStateCollectionName, Map<string, Uint8Array>>()
            for (const doc of valueDocs) {
                const name = doc._id.collection as AppStateCollectionName
                let map = indexValueMaps.get(name)
                if (!map) {
                    map = new Map<string, Uint8Array>()
                    indexValueMaps.set(name, map)
                }
                map.set(doc._id.index_mac_hex, fromBinary(doc.value_mac))
            }

            return collections.map((collection) => {
                const version = versionsByCollection.get(collection)
                if (!version) {
                    return {
                        initialized: false,
                        version: 0,
                        hash: APP_STATE_EMPTY_LT_HASH,
                        indexValueMap: new Map()
                    }
                }
                return {
                    initialized: true,
                    version: version.version,
                    hash: version.hash,
                    indexValueMap: indexValueMaps.get(collection) ?? new Map()
                }
            })
        })
    }

    public async setCollectionStates(
        updates: readonly WaAppStateCollectionStateUpdate[]
    ): Promise<void> {
        if (updates.length === 0) return
        await this.withSession(async (session) => {
            const versionsCol = this.col<CollectionVersionDoc>('appstate_collection_versions')
            const valuesCol = this.col<IndexValueDoc>('appstate_collection_index_values')

            const versionOps: AnyBulkWriteOperation<CollectionVersionDoc>[] = []
            for (const update of updates) {
                versionOps.push({
                    updateOne: {
                        filter: {
                            _id: { session_id: this.sessionId, collection: update.collection }
                        },
                        update: {
                            $set: {
                                version: update.version,
                                hash: toBinary(update.hash)
                            }
                        },
                        upsert: true
                    }
                })
            }
            await versionsCol.bulkWrite(versionOps, { session })

            for (const update of updates) {
                await valuesCol.deleteMany(
                    {
                        '_id.session_id': this.sessionId,
                        '_id.collection': update.collection
                    },
                    { session }
                )

                const valueOps: AnyBulkWriteOperation<IndexValueDoc>[] = []
                for (const [indexMacHex, valueMac] of update.indexValueMap.entries()) {
                    valueOps.push({
                        updateOne: {
                            filter: {
                                _id: {
                                    session_id: this.sessionId,
                                    collection: update.collection,
                                    index_mac_hex: indexMacHex
                                }
                            },
                            update: {
                                $set: { value_mac: toBinary(valueMac) }
                            },
                            upsert: true
                        }
                    })
                }
                if (valueOps.length > 0) {
                    await valuesCol.bulkWrite(valueOps, { session })
                }
            }
        })
    }

    public async clear(): Promise<void> {
        await this.ensureIndexes()
        await Promise.all([
            this.col<SyncKeyDoc>('appstate_sync_keys').deleteMany({
                '_id.session_id': this.sessionId
            }),
            this.col<CollectionVersionDoc>('appstate_collection_versions').deleteMany({
                '_id.session_id': this.sessionId
            }),
            this.col<IndexValueDoc>('appstate_collection_index_values').deleteMany({
                '_id.session_id': this.sessionId
            })
        ])
    }
}
