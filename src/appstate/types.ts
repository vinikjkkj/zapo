import type { Proto } from '../proto'
import type {
    WA_APP_STATE_COLLECTIONS,
    WA_APP_STATE_COLLECTION_STATES
} from '../protocol/constants'

export type AppStateCollectionName =
    (typeof WA_APP_STATE_COLLECTIONS)[keyof typeof WA_APP_STATE_COLLECTIONS]

export type AppStateCollectionState =
    (typeof WA_APP_STATE_COLLECTION_STATES)[keyof typeof WA_APP_STATE_COLLECTION_STATES]

export interface WaAppStateSyncKey {
    readonly keyId: Uint8Array
    readonly keyData: Uint8Array
    readonly timestamp: number
    readonly fingerprint?: Proto.Message.IAppStateSyncKeyFingerprint
}

export interface WaAppStateCollectionVersion {
    readonly version: number
    readonly hash: Uint8Array
    readonly indexValueMap: Readonly<Record<string, Uint8Array>>
}

export interface WaAppStateStoreData {
    readonly keys: readonly WaAppStateSyncKey[]
    readonly collections: Partial<Record<AppStateCollectionName, WaAppStateCollectionVersion>>
}

export type WaAppStateMutationInput =
    | {
          readonly collection: AppStateCollectionName
          readonly operation: 'set'
          readonly index: string
          readonly value: Proto.ISyncActionValue
          readonly version: number
          readonly timestamp: number
      }
    | {
          readonly collection: AppStateCollectionName
          readonly operation: 'remove'
          readonly index: string
          readonly previousValue: Proto.ISyncActionValue
          readonly version: number
          readonly timestamp: number
      }

export interface WaAppStateMutation {
    readonly collection: AppStateCollectionName
    readonly operation: 'set' | 'remove'
    readonly index: string
    readonly value: Proto.ISyncActionValue | null
    readonly version: number
    readonly indexMac: Uint8Array
    readonly valueMac: Uint8Array
    readonly keyId: Uint8Array
    readonly timestamp: number
}

export interface WaAppStateCollectionSyncResult {
    readonly collection: AppStateCollectionName
    readonly state: AppStateCollectionState
    readonly version?: number
    readonly mutations?: readonly WaAppStateMutation[]
}

export interface WaAppStateSyncResult {
    readonly collections: readonly WaAppStateCollectionSyncResult[]
}

export interface WaAppStateSyncOptions {
    readonly collections?: readonly AppStateCollectionName[]
    readonly pendingMutations?: readonly WaAppStateMutationInput[]
    readonly downloadExternalBlob?: (
        collection: AppStateCollectionName,
        kind: 'snapshot' | 'patch',
        reference: Proto.IExternalBlobReference
    ) => Promise<Uint8Array>
    readonly timeoutMs?: number
}
