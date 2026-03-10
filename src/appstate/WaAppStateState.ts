import { cloneBytes, uint8Equal } from '../util/bytes'

import { APP_STATE_EMPTY_LT_HASH } from './constants'
import type {
    AppStateCollectionName,
    WaAppStateCollectionVersion,
    WaAppStateStoreData,
    WaAppStateSyncKey
} from './types'
import { keyDeviceId, keyEpoch, keyIdToHex } from './utils'

interface MutableCollectionState {
    version: number
    hash: Uint8Array
    indexValueMap: Map<string, Uint8Array>
}

export class WaAppStateState {
    private readonly keys: Map<string, WaAppStateSyncKey>
    private readonly collections: Map<AppStateCollectionName, MutableCollectionState>

    public constructor(initial?: WaAppStateStoreData) {
        this.keys = new Map()
        this.collections = new Map()
        if (initial) {
            this.hydrate(initial)
        }
    }

    public hydrate(data: WaAppStateStoreData): void {
        this.keys.clear()
        this.collections.clear()

        for (const key of data.keys) {
            this.keys.set(keyIdToHex(key.keyId), {
                keyId: cloneBytes(key.keyId),
                keyData: cloneBytes(key.keyData),
                timestamp: key.timestamp,
                fingerprint: key.fingerprint
                    ? {
                          rawId: key.fingerprint.rawId,
                          currentIndex: key.fingerprint.currentIndex,
                          deviceIndexes: key.fingerprint.deviceIndexes
                              ? [...key.fingerprint.deviceIndexes]
                              : []
                      }
                    : undefined
            })
        }

        for (const [collectionName, collection] of Object.entries(data.collections) as readonly [
            AppStateCollectionName,
            WaAppStateCollectionVersion | undefined
        ][]) {
            if (!collection) {
                continue
            }
            const indexValueMap = new Map<string, Uint8Array>()
            for (const [indexMacHex, valueMac] of Object.entries(collection.indexValueMap)) {
                indexValueMap.set(indexMacHex, cloneBytes(valueMac))
            }
            this.collections.set(collectionName, {
                version: collection.version,
                hash: cloneBytes(collection.hash),
                indexValueMap
            })
        }
    }

    public export(): WaAppStateStoreData {
        const keys: WaAppStateSyncKey[] = []
        for (const key of this.keys.values()) {
            keys.push({
                keyId: cloneBytes(key.keyId),
                keyData: cloneBytes(key.keyData),
                timestamp: key.timestamp,
                fingerprint: key.fingerprint
                    ? {
                          rawId: key.fingerprint.rawId,
                          currentIndex: key.fingerprint.currentIndex,
                          deviceIndexes: key.fingerprint.deviceIndexes
                              ? [...key.fingerprint.deviceIndexes]
                              : []
                      }
                    : undefined
            })
        }

        const collections: WaAppStateStoreData['collections'] = {}
        for (const [collectionName, collection] of this.collections.entries()) {
            const indexValueMap: Record<string, Uint8Array> = {}
            for (const [indexMacHex, valueMac] of collection.indexValueMap.entries()) {
                indexValueMap[indexMacHex] = cloneBytes(valueMac)
            }
            collections[collectionName] = {
                version: collection.version,
                hash: cloneBytes(collection.hash),
                indexValueMap
            }
        }

        return {
            keys,
            collections
        }
    }

    public upsertKeys(keys: readonly WaAppStateSyncKey[]): number {
        let inserted = 0
        for (const key of keys) {
            const keyHex = keyIdToHex(key.keyId)
            const existing = this.keys.get(keyHex)
            if (existing && uint8Equal(existing.keyData, key.keyData)) {
                continue
            }
            this.keys.set(keyHex, {
                keyId: cloneBytes(key.keyId),
                keyData: cloneBytes(key.keyData),
                timestamp: key.timestamp,
                fingerprint: key.fingerprint
                    ? {
                          rawId: key.fingerprint.rawId,
                          currentIndex: key.fingerprint.currentIndex,
                          deviceIndexes: key.fingerprint.deviceIndexes
                              ? [...key.fingerprint.deviceIndexes]
                              : []
                      }
                    : undefined
            })
            inserted += 1
        }
        return inserted
    }

    public getKeyData(keyId: Uint8Array): Uint8Array | null {
        const key = this.keys.get(keyIdToHex(keyId))
        return key ? cloneBytes(key.keyData) : null
    }

    public getActiveKey(): WaAppStateSyncKey | null {
        let active: WaAppStateSyncKey | null = null
        for (const key of this.keys.values()) {
            if (!active) {
                active = key
                continue
            }
            const currentEpoch = keyEpoch(active.keyId)
            const nextEpoch = keyEpoch(key.keyId)
            if (nextEpoch > currentEpoch) {
                active = key
                continue
            }
            if (nextEpoch < currentEpoch) {
                continue
            }
            if (keyDeviceId(key.keyId) < keyDeviceId(active.keyId)) {
                active = key
            }
        }
        if (!active) {
            return null
        }
        return {
            keyId: cloneBytes(active.keyId),
            keyData: cloneBytes(active.keyData),
            timestamp: active.timestamp,
            fingerprint: active.fingerprint
                ? {
                      rawId: active.fingerprint.rawId,
                      currentIndex: active.fingerprint.currentIndex,
                      deviceIndexes: active.fingerprint.deviceIndexes
                          ? [...active.fingerprint.deviceIndexes]
                          : []
                  }
                : undefined
        }
    }

    public getCollection(collection: AppStateCollectionName): MutableCollectionState {
        let state = this.collections.get(collection)
        if (!state) {
            state = {
                version: 0,
                hash: cloneBytes(APP_STATE_EMPTY_LT_HASH),
                indexValueMap: new Map()
            }
            this.collections.set(collection, state)
        }
        return state
    }

    public getCollectionSnapshot(collection: AppStateCollectionName): WaAppStateCollectionVersion {
        const state = this.getCollection(collection)
        const indexValueMap: Record<string, Uint8Array> = {}
        for (const [indexMacHex, valueMac] of state.indexValueMap.entries()) {
            indexValueMap[indexMacHex] = cloneBytes(valueMac)
        }
        return {
            version: state.version,
            hash: cloneBytes(state.hash),
            indexValueMap
        }
    }

    public replaceCollection(
        collection: AppStateCollectionName,
        version: number,
        hash: Uint8Array,
        indexValueMap: Map<string, Uint8Array>
    ): void {
        const copiedMap = new Map<string, Uint8Array>()
        for (const [indexMacHex, valueMac] of indexValueMap.entries()) {
            copiedMap.set(indexMacHex, cloneBytes(valueMac))
        }
        this.collections.set(collection, {
            version,
            hash: cloneBytes(hash),
            indexValueMap: copiedMap
        })
    }

    public updateCollectionVersionAndHash(
        collection: AppStateCollectionName,
        version: number,
        hash: Uint8Array,
        indexValueMap: Map<string, Uint8Array>
    ): void {
        this.replaceCollection(collection, version, hash, indexValueMap)
    }
}
