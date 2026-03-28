import type { PoolConnection } from 'mysql2/promise'
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

import { BaseMysqlStore } from './BaseMysqlStore'
import { queryFirst, queryRows, toBytes, toBytesOrNull, bytesToHex, uint8Equal } from './helpers'
import type { MysqlParam, WaMysqlStorageOptions } from './types'

const BATCH_SIZE = 500
const FIXED_IN_PLACEHOLDERS = Array.from({ length: BATCH_SIZE }, () => '?').join(', ')
const COLLECTION_BATCH = 8
const FIXED_COLLECTION_PLACEHOLDERS = Array.from({ length: COLLECTION_BATCH }, () => '?').join(', ')
const EMPTY_KEY_PAD = new Uint8Array(0)

export class WaAppStateMysqlStore extends BaseMysqlStore implements WaAppStateStore {
    public constructor(options: WaMysqlStorageOptions) {
        super(options, ['appState'])
    }

    public async exportData(): Promise<WaAppStateStoreData> {
        return this.withTransaction(async (conn) => {
            const keyRows = queryRows(
                await conn.execute(
                    `SELECT key_id, key_data, timestamp, fingerprint
                     FROM ${this.t('appstate_sync_keys')}
                     WHERE session_id = ?`,
                    [this.sessionId]
                )
            )
            const versionRows = queryRows(
                await conn.execute(
                    `SELECT collection, version, hash
                     FROM ${this.t('appstate_collection_versions')}
                     WHERE session_id = ?`,
                    [this.sessionId]
                )
            )
            const valueRows = queryRows(
                await conn.execute(
                    `SELECT collection, index_mac_hex, value_mac
                     FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = ?`,
                    [this.sessionId]
                )
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
        await this.withTransaction(async (conn) => {
            const keyIds = keys.map((k) => k.keyId)
            const existingByHex = await this.selectSyncKeyDataByIds(conn, keyIds)

            for (const key of keys) {
                const existing = existingByHex.get(bytesToHex(key.keyId))
                if (existing && uint8Equal(existing, key.keyData)) {
                    continue
                }
                await conn.execute(
                    `INSERT INTO ${this.t('appstate_sync_keys')} (
                        session_id, key_id, key_data, timestamp, fingerprint, key_epoch
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        key_data = VALUES(key_data),
                        timestamp = VALUES(timestamp),
                        fingerprint = VALUES(fingerprint),
                        key_epoch = VALUES(key_epoch)`,
                    [
                        this.sessionId,
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
        if (keyIds.length === 0) return []
        await this.ensureReady()
        const byHex = await this.selectSyncKeysByIds(keyIds)
        return keyIds.map((id) => byHex.get(bytesToHex(id)) ?? null)
    }

    public async getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        await this.ensureReady()
        const row = queryFirst(
            await this.pool.execute(
                `SELECT key_data
             FROM ${this.t('appstate_sync_keys')}
             WHERE session_id = ? AND key_id = ?`,
                [this.sessionId, keyId]
            )
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
            await this.pool.execute(
                `SELECT key_id, key_data, timestamp, fingerprint
             FROM ${this.t('appstate_sync_keys')}
             WHERE session_id = ?
             ORDER BY key_epoch DESC, key_id ASC
             LIMIT 1`,
                [this.sessionId]
            )
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
        return this.withTransaction(async (conn) => {
            const versionRow = queryFirst(
                await conn.execute(
                    `SELECT version, hash
                     FROM ${this.t('appstate_collection_versions')}
                     WHERE session_id = ? AND collection = ?`,
                    [this.sessionId, collection]
                )
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
                await conn.execute(
                    `SELECT index_mac_hex, value_mac
                     FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = ? AND collection = ?`,
                    [this.sessionId, collection]
                )
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
        return this.withTransaction(async (conn) => {
            const uniqueCollections: string[] = [...new Set(collections)]
            while (uniqueCollections.length < COLLECTION_BATCH) uniqueCollections.push('')
            const params: MysqlParam[] = [this.sessionId, ...uniqueCollections]

            const versionRows = queryRows(
                await conn.execute(
                    `SELECT collection, version, hash
                     FROM ${this.t('appstate_collection_versions')}
                     WHERE session_id = ? AND collection IN (${FIXED_COLLECTION_PLACEHOLDERS})`,
                    params
                )
            )
            const valueRows = queryRows(
                await conn.execute(
                    `SELECT collection, index_mac_hex, value_mac
                     FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = ? AND collection IN (${FIXED_COLLECTION_PLACEHOLDERS})`,
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
        await this.withTransaction(async (conn) => {
            for (const update of updates) {
                await conn.execute(
                    `INSERT INTO ${this.t('appstate_collection_versions')} (
                        session_id, collection, version, hash
                    ) VALUES (?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        version = VALUES(version),
                        hash = VALUES(hash)`,
                    [this.sessionId, update.collection, update.version, update.hash]
                )

                await conn.execute(
                    `DELETE FROM ${this.t('appstate_collection_index_values')}
                     WHERE session_id = ? AND collection = ?`,
                    [this.sessionId, update.collection]
                )

                for (const [indexMacHex, valueMac] of update.indexValueMap.entries()) {
                    await conn.execute(
                        `INSERT INTO ${this.t('appstate_collection_index_values')} (
                            session_id, collection, index_mac_hex, value_mac
                        ) VALUES (?, ?, ?, ?)`,
                        [this.sessionId, update.collection, indexMacHex, valueMac]
                    )
                }
            }
        })
    }

    public async clear(): Promise<void> {
        await this.withTransaction(async (conn) => {
            await conn.execute(`DELETE FROM ${this.t('appstate_sync_keys')} WHERE session_id = ?`, [
                this.sessionId
            ])
            await conn.execute(
                `DELETE FROM ${this.t('appstate_collection_versions')} WHERE session_id = ?`,
                [this.sessionId]
            )
            await conn.execute(
                `DELETE FROM ${this.t('appstate_collection_index_values')} WHERE session_id = ?`,
                [this.sessionId]
            )
        })
    }

    // ── Private helpers ───────────────────────────────────────────────

    private async selectSyncKeyDataByIds(
        executor: { execute: PoolConnection['execute'] },
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
            while (batch.length < BATCH_SIZE) batch.push(EMPTY_KEY_PAD)
            const params: MysqlParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await executor.execute(
                    `SELECT key_id, key_data
                 FROM ${this.t('appstate_sync_keys')}
                 WHERE session_id = ? AND key_id IN (${FIXED_IN_PLACEHOLDERS})`,
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
            while (batch.length < BATCH_SIZE) batch.push(EMPTY_KEY_PAD)
            const params: MysqlParam[] = [this.sessionId, ...batch]
            const rows = queryRows(
                await this.pool.execute(
                    `SELECT key_id, key_data, timestamp, fingerprint
                 FROM ${this.t('appstate_sync_keys')}
                 WHERE session_id = ? AND key_id IN (${FIXED_IN_PLACEHOLDERS})`,
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
