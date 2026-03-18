import { APP_STATE_EMPTY_LT_HASH } from '@appstate/constants'
import {
    decodeAppStateCollections,
    decodeAppStateFingerprint,
    decodeAppStateSyncKeys,
    encodeAppStateFingerprint,
    type AppStateCollectionValueRow,
    type AppStateCollectionVersionRow,
    type AppStateSyncKeyRow
} from '@appstate/store/sqlite'
import type {
    AppStateCollectionName,
    WaAppStateSyncKey,
    WaAppStateStoreData
} from '@appstate/types'
import { keyEpoch, pickActiveSyncKey } from '@appstate/utils'
import type {
    WaAppStateCollectionStateUpdate,
    WaAppStateCollectionStoreState,
    WaAppStateStore
} from '@store/contracts/appstate.store'
import { BaseSqliteStore } from '@store/providers/sqlite/BaseSqliteStore'
import type { WaSqliteStorageOptions } from '@store/types'
import { uint8Equal } from '@util/bytes'
import { asBytes, asNumber, asString } from '@util/coercion'

interface KeyDataRow extends Record<string, unknown> {
    readonly key_data: unknown
}

export class WaAppStateSqliteStore extends BaseSqliteStore implements WaAppStateStore {
    public constructor(options: WaSqliteStorageOptions) {
        super(options, ['appState'])
    }

    public async exportData(): Promise<WaAppStateStoreData> {
        const db = await this.getConnection()
        const keyRows = db.all<AppStateSyncKeyRow>(
            `SELECT key_id, key_data, timestamp, fingerprint
             FROM appstate_sync_keys
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        const versionRows = db.all<AppStateCollectionVersionRow>(
            `SELECT collection, version, hash
             FROM appstate_collection_versions
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        const valueRows = db.all<AppStateCollectionValueRow>(
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
            for (const key of keys) {
                const existing = db.get<KeyDataRow>(
                    `SELECT key_data
                     FROM appstate_sync_keys
                     WHERE session_id = ? AND key_id = ?`,
                    [this.options.sessionId, key.keyId]
                )
                if (
                    existing &&
                    uint8Equal(
                        asBytes(existing.key_data, 'appstate_sync_keys.key_data'),
                        key.keyData
                    )
                ) {
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

    public async getSyncKey(keyId: Uint8Array): Promise<WaAppStateSyncKey | null> {
        const db = await this.getConnection()
        const row = db.get<AppStateSyncKeyRow>(
            `SELECT key_id, key_data, timestamp, fingerprint
             FROM appstate_sync_keys
             WHERE session_id = ? AND key_id = ?`,
            [this.options.sessionId, keyId]
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

    public async getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        const db = await this.getConnection()
        const row = db.get<KeyDataRow>(
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

    public async getActiveSyncKey(): Promise<WaAppStateSyncKey | null> {
        const db = await this.getConnection()
        const rows = db.all<AppStateSyncKeyRow>(
            `SELECT key_id, key_data, timestamp, fingerprint
             FROM appstate_sync_keys
             WHERE session_id = ?`,
            [this.options.sessionId]
        )
        const keys: WaAppStateSyncKey[] = []
        for (const row of rows) {
            const key = {
                keyId: asBytes(row.key_id, 'appstate_sync_keys.key_id'),
                keyData: asBytes(row.key_data, 'appstate_sync_keys.key_data'),
                timestamp: asNumber(row.timestamp, 'appstate_sync_keys.timestamp'),
                fingerprint: decodeAppStateFingerprint(row.fingerprint)
            }
            keys.push(key)
        }
        return pickActiveSyncKey(keys)
    }

    public async getCollectionState(
        collection: AppStateCollectionName
    ): Promise<WaAppStateCollectionStoreState> {
        const db = await this.getConnection()
        const versionRow = db.get<AppStateCollectionVersionRow>(
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

        const valueRows = db.all<AppStateCollectionValueRow>(
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
}
