import type {
    AppStateCollectionName,
    WaAppStateStoreData,
    WaAppStateSyncKey
} from '@appstate/types'
import { proto } from '@proto'
import { asBytes, asNumber, asOptionalBytes, asString } from '@util/coercion'

type StoreRow = Readonly<Record<string, unknown>>

export function encodeAppStateFingerprint(
    fingerprint: WaAppStateSyncKey['fingerprint']
): Uint8Array | null {
    if (!fingerprint) {
        return null
    }
    return proto.Message.AppStateSyncKeyFingerprint.encode(fingerprint).finish()
}

export function decodeAppStateFingerprint(
    raw: unknown
): WaAppStateSyncKey['fingerprint'] | undefined {
    const bytes = asOptionalBytes(raw, 'appstate_sync_keys.fingerprint')
    if (!bytes) {
        return undefined
    }
    try {
        return proto.Message.AppStateSyncKeyFingerprint.decode(bytes)
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error)
        throw new Error(`invalid appstate_sync_keys.fingerprint protobuf payload: ${reason}`)
    }
}

export function decodeAppStateSyncKeys(rows: readonly StoreRow[]): readonly WaAppStateSyncKey[] {
    const decoded = new Array<WaAppStateSyncKey>(rows.length)
    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i]
        decoded[i] = {
            keyId: asBytes(row.key_id, 'appstate_sync_keys.key_id'),
            keyData: asBytes(row.key_data, 'appstate_sync_keys.key_data'),
            timestamp: asNumber(row.timestamp, 'appstate_sync_keys.timestamp'),
            fingerprint: decodeAppStateFingerprint(row.fingerprint)
        }
    }
    return decoded
}

export function decodeAppStateCollections(
    versionRows: readonly StoreRow[],
    valueRows: readonly StoreRow[]
): WaAppStateStoreData['collections'] {
    const valueMapByCollection = new Map<string, Record<string, Uint8Array>>()
    for (const row of valueRows) {
        const collection = asString(row.collection, 'appstate_collection_index_values.collection')
        const byIndex = valueMapByCollection.get(collection) ?? {}
        byIndex[asString(row.index_mac_hex, 'appstate_collection_index_values.index_mac_hex')] =
            asBytes(row.value_mac, 'appstate_collection_index_values.value_mac')
        valueMapByCollection.set(collection, byIndex)
    }

    const collections: WaAppStateStoreData['collections'] = {}
    for (const row of versionRows) {
        const collection = asString(
            row.collection,
            'appstate_collection_versions.collection'
        ) as AppStateCollectionName
        collections[collection] = {
            version: asNumber(row.version, 'appstate_collection_versions.version'),
            hash: asBytes(row.hash, 'appstate_collection_versions.hash'),
            indexValueMap: valueMapByCollection.get(collection) ?? {}
        }
    }
    return collections
}
