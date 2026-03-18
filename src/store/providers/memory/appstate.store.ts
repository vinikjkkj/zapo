import { APP_STATE_EMPTY_LT_HASH } from '@appstate/constants'
import type {
    AppStateCollectionName,
    WaAppStateStoreData,
    WaAppStateSyncKey
} from '@appstate/types'
import { keyIdToHex, pickActiveSyncKey } from '@appstate/utils'
import type {
    WaAppStateCollectionStateUpdate,
    WaAppStateCollectionStoreState,
    WaAppStateStore
} from '@store/contracts/appstate.store'
import { uint8Equal } from '@util/bytes'
import { resolvePositive } from '@util/coercion'
import { setBoundedMapEntry } from '@util/collections'

const DEFAULT_APPSTATE_MEMORY_STORE_LIMITS = Object.freeze({
    syncKeys: 4_096,
    collectionEntries: 50_000
})

export interface WaAppStateMemoryStoreOptions {
    readonly maxSyncKeys?: number
    readonly maxCollectionEntries?: number
}

function toBoundedMap<K, V>(entries: Iterable<readonly [K, V]>, maxEntries: number): Map<K, V> {
    const map = new Map<K, V>()
    for (const [key, value] of entries) {
        setBoundedMapEntry(map, key, value, maxEntries)
    }
    return map
}

interface MutableCollectionState {
    initialized: boolean
    version: number
    hash: Uint8Array
    indexValueMap: Map<string, Uint8Array>
}

export class WaAppStateMemoryStore implements WaAppStateStore {
    private readonly keys: Map<string, WaAppStateSyncKey>
    private readonly collections: Map<AppStateCollectionName, MutableCollectionState>
    private readonly maxSyncKeys: number
    private readonly maxCollectionEntries: number

    public constructor(initial?: WaAppStateStoreData, options: WaAppStateMemoryStoreOptions = {}) {
        this.keys = new Map()
        this.collections = new Map()
        this.maxSyncKeys = resolvePositive(
            options.maxSyncKeys,
            DEFAULT_APPSTATE_MEMORY_STORE_LIMITS.syncKeys,
            'WaAppStateMemoryStoreOptions.maxSyncKeys'
        )
        this.maxCollectionEntries = resolvePositive(
            options.maxCollectionEntries,
            DEFAULT_APPSTATE_MEMORY_STORE_LIMITS.collectionEntries,
            'WaAppStateMemoryStoreOptions.maxCollectionEntries'
        )
        if (initial) {
            for (const key of initial.keys) {
                setBoundedMapEntry(this.keys, keyIdToHex(key.keyId), key, this.maxSyncKeys)
            }
            for (const [collectionName, collection] of Object.entries(
                initial.collections
            ) as readonly [
                AppStateCollectionName,
                WaAppStateStoreData['collections'][AppStateCollectionName]
            ][]) {
                if (!collection) {
                    continue
                }
                this.collections.set(collectionName, {
                    initialized: true,
                    version: collection.version,
                    hash: collection.hash,
                    indexValueMap: toBoundedMap(
                        Object.entries(collection.indexValueMap),
                        this.maxCollectionEntries
                    )
                })
            }
        }
    }

    public async exportData(): Promise<WaAppStateStoreData> {
        const keys = Array.from(this.keys.values())
        const collections: WaAppStateStoreData['collections'] = {}
        for (const [collection, state] of this.collections.entries()) {
            collections[collection] = {
                version: state.version,
                hash: state.hash,
                indexValueMap: Object.fromEntries(state.indexValueMap.entries())
            }
        }
        return {
            keys,
            collections
        }
    }

    public async upsertSyncKeys(keys: readonly WaAppStateSyncKey[]): Promise<number> {
        let inserted = 0
        for (const key of keys) {
            const keyHex = keyIdToHex(key.keyId)
            const existing = this.keys.get(keyHex)
            if (existing && uint8Equal(existing.keyData, key.keyData)) {
                continue
            }
            setBoundedMapEntry(this.keys, keyHex, key, this.maxSyncKeys)
            inserted += 1
        }
        return inserted
    }

    public async getSyncKey(keyId: Uint8Array): Promise<WaAppStateSyncKey | null> {
        return this.keys.get(keyIdToHex(keyId)) ?? null
    }

    public async getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null> {
        return this.keys.get(keyIdToHex(keyId))?.keyData ?? null
    }

    public async getActiveSyncKey(): Promise<WaAppStateSyncKey | null> {
        return pickActiveSyncKey(this.keys.values())
    }

    public async getCollectionState(
        collection: AppStateCollectionName
    ): Promise<WaAppStateCollectionStoreState> {
        let state = this.collections.get(collection)
        if (!state) {
            state = {
                initialized: false,
                version: 0,
                hash: APP_STATE_EMPTY_LT_HASH,
                indexValueMap: new Map()
            }
            this.collections.set(collection, state)
        }
        return state
    }

    public async setCollectionStates(
        updates: readonly WaAppStateCollectionStateUpdate[]
    ): Promise<void> {
        for (const update of updates) {
            this.collections.set(update.collection, {
                initialized: true,
                version: update.version,
                hash: update.hash,
                indexValueMap: toBoundedMap(
                    update.indexValueMap.entries(),
                    this.maxCollectionEntries
                )
            })
        }
    }

    public async clear(): Promise<void> {
        this.keys.clear()
        this.collections.clear()
    }
}
