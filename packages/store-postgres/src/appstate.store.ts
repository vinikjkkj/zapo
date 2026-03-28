import type { PoolClient } from 'pg'
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

import { BasePgStore } from './BasePgStore'
import { queryFirst, queryRows, toBytes, toBytesOrNull, bytesToHex, uint8Equal } from './helpers'
import type { PgParam, WaPgStorageOptions } from './types'

const BATCH_SIZE = 500

export class WaAppStatePgStore extends BasePgStore implements WaAppStateStore {
    public constructor(options: WaPgStorageOptions) {
        super(options, ['appState'])
    }

    public async exportData(): Promise<WaAppStateStoreData> {
        return this.withTransaction(async (client) => {
            const keyRows = queryRows(
                await client.query({
                    name: this.stmtName('appstate_export_keys'),
                    text: `SELECT key_id, key_data, timestamp, fingerprint
                     FROM ${this.t('appstate_sync_keys')}
                     WHERE session_id = $1`,
                    values: [this.sessionId]
                })
            )
            const versionRows = queryRows(
                await client.query({
                    name: this.stmtName('appstate_export_versions'),
                    text: `SELECT collection, version, hash
                     FROM ${this.t('appstate_collection_versions')}
                     WHERE session_id = $1`,
                    values: [this.sessionId]
                })
            )
            const valueRows = queryRows(
                await client.query({
                    name: this.stmtName('appstate_export_values'),
                    text: `SELECT collection, index_mac_hex, value_mac
                     FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = $1`,
                    values: [this.sessionId]
                })
            )

            const keys: WaAppStateSyncKey[] = keyRows.map((row) => ({
                keyId: toBytes(row.key_id),
                keyData: toBytes(row.key_data),
                timestamp: Number(row.timestamp),
                fingerprint: decodeAppStateFingerprint(toBytesOrNull(row.fingerprint))
            }))

            const collections: WaAppStateStoreData['collections'] = {}
            for (const row of versionRows) {
                const name = String(row.collection) as AppStateCollectionName
                collections[name] = {
                    version: Number(row.version),
                    hash: toBytes(row.hash),
                    indexValueMap: {}
                }
            }
            for (const row of valueRows) {
                const name = String(row.collection) as AppStateCollectionName
                const entry = collections[name]
                if (entry) {
                    ;(entry.indexValueMap as Record<string, Uint8Array>)[
                        String(row.index_mac_hex)
                    ] = toBytes(row.value_mac)
                }
            }

            return { keys, collections }
        })
    }

    public async upsertSyncKeys(keys: readonly WaAppStateSyncKey[]): Promise<number> {
        if (keys.length === 0) return 0
        let inserted = 0
        await this.withTransaction(async (client) => {
            const keyIds = keys.map((k) => k.keyId)
            const existingByHex = await this.selectSyncKeyDataByIds(client, keyIds)

            for (const key of keys) {
                const existing = existingByHex.get(bytesToHex(key.keyId))
                if (existing && uint8Equal(existing, key.keyData)) {
                    continue
                }
                await client.query({
                    name: this.stmtName('appstate_upsert_sync_key'),
                    text: `INSERT INTO ${this.t('appstate_sync_keys')} (
                        session_id, key_id, key_data, timestamp, fingerprint, key_epoch
                    ) VALUES ($1, $2, $3, $4, $5, $6)
                    ON CONFLICT (session_id, key_id) DO UPDATE SET
                        key_data = EXCLUDED.key_data,
                        timestamp = EXCLUDED.timestamp,
                        fingerprint = EXCLUDED.fingerprint,
                        key_epoch = EXCLUDED.key_epoch`,
                    values: [
                        this.sessionId,
                        key.keyId,
                        key.keyData,
                        key.timestamp,
                        encodeAppStateFingerprint(key.fingerprint),
                        keyEpoch(key.keyId)
                    ]
                })
                inserted += 1
            }
        })
        return inserted
    }

    public async getSyncKeysBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (WaAppStateSyncKey | null)[]> {
        if (keyIds.length === 0) return []
        await this.ensureReady()
        const byHex = await this.selectSyncKeysByIds(keyIds)
        return keyIds.map((id) => byHex.get(bytesToHex(id)) ?? null)
    }

    public async getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('appstate_get_sync_key_data'),
                text: `SELECT key_data
                 FROM ${this.t('appstate_sync_keys')}
                 WHERE session_id = $1 AND key_id = $2`,
                values: [this.sessionId, keyId]
            })
        )
        if (!row) return null
        return toBytes(row.key_data)
    }

    public async getSyncKeyDataBatch(
        keyIds: readonly Uint8Array[]
    ): Promise<readonly (Uint8Array | null)[]> {
        if (keyIds.length === 0) return []
        await this.ensureReady()
        const byHex = await this.selectSyncKeyDataByIds(this.pool, keyIds)
        return keyIds.map((id) => byHex.get(bytesToHex(id)) ?? null)
    }

    public async getActiveSyncKey(): Promise<WaAppStateSyncKey | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.query({
                name: this.stmtName('appstate_get_active_sync_key'),
                text: `SELECT key_id, key_data, timestamp, fingerprint
                 FROM ${this.t('appstate_sync_keys')}
                 WHERE session_id = $1
                 ORDER BY key_epoch DESC, key_id ASC
                 LIMIT 1`,
                values: [this.sessionId]
            })
        )
        if (!row) return null
        return {
            keyId: toBytes(row.key_id),
            keyData: toBytes(row.key_data),
            timestamp: Number(row.timestamp),
            fingerprint: decodeAppStateFingerprint(toBytesOrNull(row.fingerprint))
        }
    }

    public async getCollectionState(
        collection: AppStateCollectionName
    ): Promise<WaAppStateCollectionStoreState> {
        return this.withTransaction(async (client) => {
            const versionRow = queryFirst(
                await client.query({
                    name: this.stmtName('appstate_get_collection_version'),
                    text: `SELECT version, hash
                     FROM ${this.t('appstate_collection_versions')}
                     WHERE session_id = $1 AND collection = $2`,
                    values: [this.sessionId, collection]
                })
            )
            if (!versionRow) {
                return {
                    initialized: false,
                    version: 0,
                    hash: APP_STATE_EMPTY_LT_HASH,
                    indexValueMap: new Map()
                }
            }

            const valueRows = queryRows(
                await client.query({
                    name: this.stmtName('appstate_get_collection_values'),
                    text: `SELECT index_mac_hex, value_mac
                     FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = $1 AND collection = $2`,
                    values: [this.sessionId, collection]
                })
            )
            const indexValueMap = new Map<string, Uint8Array>()
            for (const row of valueRows) {
                indexValueMap.set(String(row.index_mac_hex), toBytes(row.value_mac))
            }

            return {
                initialized: true,
                version: Number(versionRow.version),
                hash: toBytes(versionRow.hash),
                indexValueMap
            }
        })
    }

    public async getCollectionStates(
        collections: readonly AppStateCollectionName[]
    ): Promise<readonly WaAppStateCollectionStoreState[]> {
        if (collections.length === 0) return []
        return this.withTransaction(async (client) => {
            const uniqueCollections = [...new Set(collections)]
            let paramIdx = 2
            const placeholders = uniqueCollections.map(() => `$${paramIdx++}`).join(', ')
            const params: PgParam[] = [this.sessionId, ...uniqueCollections]

            const versionRows = queryRows(
                await client.query(
                    `SELECT collection, version, hash
                     FROM ${this.t('appstate_collection_versions')}
                     WHERE session_id = $1 AND collection IN (${placeholders})`,
                    params
                )
            )
            const valueRows = queryRows(
                await client.query(
                    `SELECT collection, index_mac_hex, value_mac
                     FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = $1 AND collection IN (${placeholders})`,
                    params
                )
            )

            const versionsByCollection = new Map<
                AppStateCollectionName,
                { version: number; hash: Uint8Array }
            >()
            for (const row of versionRows) {
                const name = String(row.collection) as AppStateCollectionName
                versionsByCollection.set(name, {
                    version: Number(row.version),
                    hash: toBytes(row.hash)
                })
            }

            const indexValueMaps = new Map<AppStateCollectionName, Map<string, Uint8Array>>()
            for (const row of valueRows) {
                const name = String(row.collection) as AppStateCollectionName
                let map = indexValueMaps.get(name)
                if (!map) {
                    map = new Map<string, Uint8Array>()
                    indexValueMaps.set(name, map)
                }
                map.set(String(row.index_mac_hex), toBytes(row.value_mac))
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
        await this.withTransaction(async (client) => {
            for (const update of updates) {
                await client.query({
                    name: this.stmtName('appstate_upsert_collection_version'),
                    text: `INSERT INTO ${this.t('appstate_collection_versions')} (
                        session_id, collection, version, hash
                    ) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (session_id, collection) DO UPDATE SET
                        version = EXCLUDED.version,
                        hash = EXCLUDED.hash`,
                    values: [this.sessionId, update.collection, update.version, update.hash]
                })

                await client.query({
                    name: this.stmtName('appstate_delete_collection_values'),
                    text: `DELETE FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = $1 AND collection = $2`,
                    values: [this.sessionId, update.collection]
                })

                for (const [indexMacHex, valueMac] of update.indexValueMap.entries()) {
                    await client.query({
                        name: this.stmtName('appstate_insert_collection_value'),
                        text: `INSERT INTO ${this.t('appstate_collection_index_values')} (
                            session_id, collection, index_mac_hex, value_mac
                        ) VALUES ($1, $2, $3, $4)`,
                        values: [this.sessionId, update.collection, indexMacHex, valueMac]
                    })
                }
            }
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction(async (client) => {
            await client.query({
                name: this.stmtName('appstate_clear_sync_keys'),
                text: `DELETE FROM ${this.t('appstate_sync_keys')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('appstate_clear_collection_versions'),
                text: `DELETE FROM ${this.t('appstate_collection_versions')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
            await client.query({
                name: this.stmtName('appstate_clear_collection_values'),
                text: `DELETE FROM ${this.t('appstate_collection_index_values')} WHERE session_id = $1`,
                values: [this.sessionId]
            })
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async selectSyncKeyDataByIds(
        executor: { query: PoolClient['query'] },
        keyIds: readonly Uint8Array[]
    ): Promise<Map<string, Uint8Array>> {
        const uniqueByHex = new Map<string, Uint8Array>()
        for (const keyId of keyIds) {
            uniqueByHex.set(bytesToHex(keyId), keyId)
        }
        const uniqueKeyIds = Array.from(uniqueByHex.values())
        if (uniqueKeyIds.length === 0) return new Map()
        const byHex = new Map<string, Uint8Array>()
        for (let start = 0; start < uniqueKeyIds.length; start += BATCH_SIZE) {
            const batch = uniqueKeyIds.slice(start, start + BATCH_SIZE)
            let paramIdx = 2
            const placeholders = batch.map(() => `$${paramIdx++}`).join(', ')
            const params: PgParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await executor.query(
                    `SELECT key_id, key_data
                     FROM ${this.t('appstate_sync_keys')}
                     WHERE session_id = $1 AND key_id IN (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                byHex.set(bytesToHex(toBytes(row.key_id)), toBytes(row.key_data))
            }
        }
        return byHex
    }

    private async selectSyncKeysByIds(
        keyIds: readonly Uint8Array[]
    ): Promise<Map<string, WaAppStateSyncKey>> {
        const uniqueByHex = new Map<string, Uint8Array>()
        for (const keyId of keyIds) {
            uniqueByHex.set(bytesToHex(keyId), keyId)
        }
        const uniqueKeyIds = Array.from(uniqueByHex.values())
        if (uniqueKeyIds.length === 0) return new Map()
        const byHex = new Map<string, WaAppStateSyncKey>()
        for (let start = 0; start < uniqueKeyIds.length; start += BATCH_SIZE) {
            const batch = uniqueKeyIds.slice(start, start + BATCH_SIZE)
            let paramIdx = 2
            const placeholders = batch.map(() => `$${paramIdx++}`).join(', ')
            const params: PgParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await this.pool.query(
                    `SELECT key_id, key_data, timestamp, fingerprint
                     FROM ${this.t('appstate_sync_keys')}
                     WHERE session_id = $1 AND key_id IN (${placeholders})`,
                    params
                )
            )
            for (const row of rows) {
                const keyId = toBytes(row.key_id)
                byHex.set(bytesToHex(keyId), {
                    keyId,
                    keyData: toBytes(row.key_data),
                    timestamp: Number(row.timestamp),
                    fingerprint: decodeAppStateFingerprint(toBytesOrNull(row.fingerprint))
                })
            }
        }
        return byHex
    }
}
