import type {
    AppStateCollectionName,
    WaAppStateSyncKey,
    WaAppStateStoreData
} from 'zapo-js/appstate'
import {
    APP_STATE_EMPTY_LT_HASH,
    decodeAppStateCollections,
    decodeAppStateFingerprint,
    decodeAppStateSyncKeys,
    encodeAppStateFingerprint,
    keyEpoch
} from 'zapo-js/appstate'
import type {
    WaAppStateCollectionStateUpdate,
    WaAppStateCollectionStoreState,
    WaAppStateStore
} from 'zapo-js/store'
import { bytesToHex, uint8Equal, asBytes, asNumber, asString } from 'zapo-js/util'

import { BaseSqliteStore } from './BaseSqliteStore'
import type { WaSqliteConnection } from './connection'
import { repeatSqlToken } from './sql-utils'
import type { WaSqliteStorageOptions } from './types'

const APP_STATE_SYNC_KEY_BATCH_SIZE = 500

export class WaAppStateSqliteStore extends BaseSqliteStore implements WaAppStateStore {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['appState'])
    }

    public async exportData(): Promise<WaAppStateStoreData> {
        const db = await this.getConnection()
        const keyRows = db.all<Readonly<Record<string, unknown>>>(
            `SELECT key_id, key_data, timestamp, fingerprint
             FROM appstate_sync_keys
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        const versionRows = db.all<Readonly<Record<string, unknown>>>(
            `SELECT collection, version, hash
             FROM appstate_collection_versions
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        const valueRows = db.all<Readonly<Record<string, unknown>>>(
            `SELECT collection, index_mac_hex, value_mac
             FROM appstate_collection_index_values
             WHERE session_id = ?`,
            [this.options.sessionId]
        )

        return {
            keys: decodeAppStateSyncKeys(keyRows),
            collections: decodeAppStateCollections(versionRows, valueRows)
        }
    }

    public async upsertSyncKeys(keys: readonly WaAppStateSyncKey[]): Promise<number> {
        let inserted = 0
        await this.withTransaction((db) => {
            const keyIds = new Array<Uint8Array>(keys.length)
            for (let index = 0; index < keys.length; index += 1) {
                keyIds[index] = keys[index].keyId
            }
            const existingByKeyHex = this.selectSyncKeyDataByIds(db, keyIds)
            for (let index = 0; index < keys.length; index += 1) {
                const key = keys[index]
                const existing = existingByKeyHex.get(bytesToHex(key.keyId))
                if (existing && uint8Equal(existing, key.keyData)) {
                    continue
                }

                db.run(
                    `INSERT INTO appstate_sync_keys (
                        session_id,
                        key_id,
                        key_data,
                        timestamp,
                        fingerprint,
                        key_epoch
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(session_id, key_id) DO UPDATE SET
                        key_data=excluded.key_data,
                        timestamp=excluded.timestamp,
                        fingerprint=excluded.fingerprint,
                        key_epoch=excluded.key_epoch`,
                    [
                        this.options.sessionId,
                        key.keyId,
                        key.keyData,
                        key.timestamp,
                        encodeAppStateFingerprint(key.fingerprint),
                        keyEpoch(key.keyId)
                    ]
                )
                inserted += 1
            }
        })
        return inserted
    }

    public async getSyncKeysBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (WaAppStateSyncKey | null)[]> {
        if (keyIds.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const byKeyHex = this.selectSyncKeysByIds(db, keyIds)
        const keys = new Array<WaAppStateSyncKey | null>(keyIds.length)
        for (let index = 0; index < keyIds.length; index += 1) {
            keys[index] = byKeyHex.get(bytesToHex(keyIds[index])) ?? null
        }
        return keys
    }

    public async getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        const db = await this.getConnection()
        const row = db.get<Readonly<Record<string, unknown>>>(
            `SELECT key_data
             FROM appstate_sync_keys
             WHERE session_id = ? AND key_id = ?`,
            [this.options.sessionId, keyId]
        )
        if (!row) {
            return null
        }
        return asBytes(row.key_data, 'appstate_sync_keys.key_data')
    }

    public async getSyncKeyDataBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (keyIds.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const byKeyHex = this.selectSyncKeyDataByIds(db, keyIds)
        const resolved = new Array<Uint8Array | null>(keyIds.length)
        for (let index = 0; index < keyIds.length; index += 1) {
            resolved[index] = byKeyHex.get(bytesToHex(keyIds[index])) ?? null
        }
        return resolved
    }

    public async getActiveSyncKey(): Promise<WaAppStateSyncKey | null> {
        const db = await this.getConnection()
        const row = db.get<Readonly<Record<string, unknown>>>(
            `SELECT key_id, key_data, timestamp, fingerprint
             FROM appstate_sync_keys
             WHERE session_id = ?
             ORDER BY key_epoch DESC, key_id ASC
             LIMIT 1`,
            [this.options.sessionId]
        )
        if (!row) {
            return null
        }
        return {
            keyId: asBytes(row.key_id, 'appstate_sync_keys.key_id'),
            keyData: asBytes(row.key_data, 'appstate_sync_keys.key_data'),
            timestamp: asNumber(row.timestamp, 'appstate_sync_keys.timestamp'),
            fingerprint: decodeAppStateFingerprint(row.fingerprint)
        }
    }

    public async getCollectionState(
        collection: AppStateCollectionName
    ): Promise<WaAppStateCollectionStoreState> {
        const db = await this.getConnection()
        const versionRow = db.get<Readonly<Record<string, unknown>>>(
            `SELECT version, hash
             FROM appstate_collection_versions
             WHERE session_id = ? AND collection = ?`,
            [this.options.sessionId, collection]
        )
        if (!versionRow) {
            return {
                initialized: false,
                version: 0,
                hash: APP_STATE_EMPTY_LT_HASH,
                indexValueMap: new Map()
            }
        }

        const valueRows = db.all<Readonly<Record<string, unknown>>>(
            `SELECT index_mac_hex, value_mac
             FROM appstate_collection_index_values
             WHERE session_id = ? AND collection = ?`,
            [this.options.sessionId, collection]
        )

        const indexValueMap = new Map<string, Uint8Array>()
        for (const row of valueRows) {
            indexValueMap.set(
                asString(row.index_mac_hex, 'appstate_collection_index_values.index_mac_hex'),
                asBytes(row.value_mac, 'appstate_collection_index_values.value_mac')
            )
        }

        return {
            initialized: true,
            version: asNumber(versionRow.version, 'appstate_collection_versions.version'),
            hash: asBytes(versionRow.hash, 'appstate_collection_versions.hash'),
            indexValueMap
        }
    }

    public async getCollectionStates(
        collections: readonly AppStateCollectionName[]
    ): Promise<readonly WaAppStateCollectionStoreState[]> {
        if (collections.length === 0) {
            return []
        }
        const db = await this.getConnection()
        const uniqueCollections = [...new Set(collections)]
        const placeholders = repeatSqlToken('?', uniqueCollections.length, ', ')
        const params: unknown[] = [this.options.sessionId, ...uniqueCollections]
        const versionRows = db.all<Readonly<Record<string, unknown>>>(
            `SELECT collection, version, hash
             FROM appstate_collection_versions
             WHERE session_id = ? AND collection IN (${placeholders})`,
            params
        )
        const valueRows = db.all<Readonly<Record<string, unknown>>>(
            `SELECT collection, index_mac_hex, value_mac
             FROM appstate_collection_index_values
             WHERE session_id = ? AND collection IN (${placeholders})`,
            params
        )

        const versionsByCollection = new Map<
            AppStateCollectionName,
            { readonly version: number; readonly hash: Uint8Array }
        >()
        for (const row of versionRows) {
            const collection = asString(
                row.collection,
                'appstate_collection_versions.collection'
            ) as AppStateCollectionName
            versionsByCollection.set(collection, {
                version: asNumber(row.version, 'appstate_collection_versions.version'),
                hash: asBytes(row.hash, 'appstate_collection_versions.hash')
            })
        }

        const indexValueMaps = new Map<AppStateCollectionName, Map<string, Uint8Array>>()
        for (const row of valueRows) {
            const collection = asString(
                row.collection,
                'appstate_collection_index_values.collection'
            ) as AppStateCollectionName
            const map = indexValueMaps.get(collection)
            const targetMap = map ?? new Map<string, Uint8Array>()
            targetMap.set(
                asString(row.index_mac_hex, 'appstate_collection_index_values.index_mac_hex'),
                asBytes(row.value_mac, 'appstate_collection_index_values.value_mac')
            )
            if (!map) {
                indexValueMaps.set(collection, targetMap)
            }
        }

        const states = new Array<WaAppStateCollectionStoreState>(collections.length)
        for (let index = 0; index < collections.length; index += 1) {
            const collection = collections[index]
            const version = versionsByCollection.get(collection)
            states[index] = version
                ? {
                      initialized: true,
                      version: version.version,
                      hash: version.hash,
                      indexValueMap: indexValueMaps.get(collection) ?? new Map()
                  }
                : {
                      initialized: false,
                      version: 0,
                      hash: APP_STATE_EMPTY_LT_HASH,
                      indexValueMap: new Map()
                  }
        }
        return states
    }

    public async setCollectionStates(
        updates: readonly WaAppStateCollectionStateUpdate[]
    ): Promise<void> {
        if (updates.length === 0) {
            return
        }
        await this.withTransaction((db) => {
            for (const update of updates) {
                db.run(
                    `INSERT INTO appstate_collection_versions (
                        session_id,
                        collection,
                        version,
                        hash
                    ) VALUES (?, ?, ?, ?)
                    ON CONFLICT(session_id, collection) DO UPDATE SET
                        version=excluded.version,
                        hash=excluded.hash`,
                    [this.options.sessionId, update.collection, update.version, update.hash]
                )

                db.run(
                    `DELETE FROM appstate_collection_index_values
                     WHERE session_id = ? AND collection = ?`,
                    [this.options.sessionId, update.collection]
                )
                for (const [indexMacHex, valueMac] of update.indexValueMap.entries()) {
                    db.run(
                        `INSERT INTO appstate_collection_index_values (
                            session_id,
                            collection,
                            index_mac_hex,
                            value_mac
                        ) VALUES (?, ?, ?, ?)`,
                        [this.options.sessionId, update.collection, indexMacHex, valueMac]
                    )
                }
            }
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction((db) => {
            db.run('DELETE FROM appstate_sync_keys WHERE session_id = ?', [this.options.sessionId])
            db.run('DELETE FROM appstate_collection_versions WHERE session_id = ?', [
                this.options.sessionId
            ])
            db.run('DELETE FROM appstate_collection_index_values WHERE session_id = ?', [
                this.options.sessionId
            ])
        })
    }

    private selectSyncKeyDataByIds(
        db: WaSqliteConnection,
        keyIds: readonly Uint8Array[]
    ): Map<string, Uint8Array> {
        const uniqueByHex = new Map<string, Uint8Array>()
        for (let index = 0; index < keyIds.length; index += 1) {
            const keyId = keyIds[index]
            uniqueByHex.set(bytesToHex(keyId), keyId)
        }
        const uniqueKeyIds = Array.from(uniqueByHex.values())
        const byKeyHex = new Map<string, Uint8Array>()
        for (let start = 0; start < uniqueKeyIds.length; start += APP_STATE_SYNC_KEY_BATCH_SIZE) {
            const end = Math.min(start + APP_STATE_SYNC_KEY_BATCH_SIZE, uniqueKeyIds.length)
            const batchLength = end - start
            const placeholders = repeatSqlToken('?', batchLength, ', ')
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                params.push(uniqueKeyIds[index])
            }
            const rows = db.all<Readonly<Record<string, unknown>>>(
                `SELECT key_id, key_data
                 FROM appstate_sync_keys
                 WHERE session_id = ? AND key_id IN (${placeholders})`,
                params
            )
            for (let index = 0; index < rows.length; index += 1) {
                const row = rows[index]
                byKeyHex.set(
                    bytesToHex(asBytes(row.key_id, 'appstate_sync_keys.key_id')),
                    asBytes(row.key_data, 'appstate_sync_keys.key_data')
                )
            }
        }
        return byKeyHex
    }

    private selectSyncKeysByIds(
        db: WaSqliteConnection,
        keyIds: readonly Uint8Array[]
    ): Map<string, WaAppStateSyncKey> {
        const uniqueByHex = new Map<string, Uint8Array>()
        for (let index = 0; index < keyIds.length; index += 1) {
            const keyId = keyIds[index]
            uniqueByHex.set(bytesToHex(keyId), keyId)
        }
        const uniqueKeyIds = Array.from(uniqueByHex.values())
        const byKeyHex = new Map<string, WaAppStateSyncKey>()
        for (let start = 0; start < uniqueKeyIds.length; start += APP_STATE_SYNC_KEY_BATCH_SIZE) {
            const end = Math.min(start + APP_STATE_SYNC_KEY_BATCH_SIZE, uniqueKeyIds.length)
            const batchLength = end - start
            const placeholders = repeatSqlToken('?', batchLength, ', ')
            const params: unknown[] = [this.options.sessionId]
            for (let index = start; index < end; index += 1) {
                params.push(uniqueKeyIds[index])
            }
            const rows = db.all<Readonly<Record<string, unknown>>>(
                `SELECT key_id, key_data, timestamp, fingerprint
                 FROM appstate_sync_keys
                 WHERE session_id = ? AND key_id IN (${placeholders})`,
                params
            )
            for (let index = 0; index < rows.length; index += 1) {
                const row = rows[index]
                const keyId = asBytes(row.key_id, 'appstate_sync_keys.key_id')
                byKeyHex.set(bytesToHex(keyId), {
                    keyId,
                    keyData: asBytes(row.key_data, 'appstate_sync_keys.key_data'),
                    timestamp: asNumber(row.timestamp, 'appstate_sync_keys.timestamp'),
                    fingerprint: decodeAppStateFingerprint(row.fingerprint)
                })
            }
        }
        return byKeyHex
    }
}
