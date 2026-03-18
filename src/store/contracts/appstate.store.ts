import type {
    AppStateCollectionName,
    WaAppStateStoreData,
    WaAppStateSyncKey
} from '@appstate/types'

export interface WaAppStateCollectionStoreState {
    readonly initialized: boolean
    readonly version: number
    readonly hash: Uint8Array
    readonly indexValueMap: ReadonlyMap<string, Uint8Array>
}

export interface WaAppStateCollectionStateUpdate {
    readonly collection: AppStateCollectionName
    readonly version: number
    readonly hash: Uint8Array
    readonly indexValueMap: ReadonlyMap<string, Uint8Array>
}

export interface WaAppStateStore {
    exportData(): Promise<WaAppStateStoreData>
    upsertSyncKeys(keys: readonly WaAppStateSyncKey[]): Promise<number>
    getSyncKey(keyId: Uint8Array): Promise<WaAppStateSyncKey | null>
    getSyncKeyData(keyId: Uint8Array): Promise<Uint8Array | null>
    getActiveSyncKey(): Promise<WaAppStateSyncKey | null>
    getCollectionState(collection: AppStateCollectionName): Promise<WaAppStateCollectionStoreState>
    setCollectionStates(updates: readonly WaAppStateCollectionStateUpdate[]): Promise<void>
    clear(): Promise<void>
}
