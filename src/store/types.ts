import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WaParticipantsStore } from '@store/contracts/participants.store'
import type { WaPrivacyTokenStore } from '@store/contracts/privacy-token.store'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { WaThreadStore } from '@store/contracts/thread.store'

export type WithDestroyLifecycle<T> = T & { readonly destroy?: () => Promise<void> }

export type WaSqliteDriver = 'auto' | 'better-sqlite3' | 'bun'

export type WaSqliteTableName =
    | 'wa_migrations'
    | 'auth_credentials'
    | 'signal_meta'
    | 'signal_registration'
    | 'signal_signed_prekey'
    | 'signal_prekey'
    | 'signal_session'
    | 'signal_identity'
    | 'sender_keys'
    | 'sender_key_distribution'
    | 'appstate_sync_keys'
    | 'appstate_collection_versions'
    | 'appstate_collection_index_values'
    | 'retry_outbound_messages'
    | 'retry_inbound_counters'
    | 'mailbox_messages'
    | 'mailbox_threads'
    | 'mailbox_contacts'
    | 'group_participants_cache'
    | 'device_list_cache'
    | 'privacy_tokens'

export type WaSqliteTableNameOverrides = Readonly<Partial<Record<WaSqliteTableName, string>>>

export interface WaSqliteStorageOptions {
    readonly path: string
    readonly sessionId: string
    readonly driver?: WaSqliteDriver
    readonly pragmas?: Readonly<Record<string, string | number>>
    readonly tableNames?: WaSqliteTableNameOverrides
}

export interface WaStoreSession {
    readonly auth: WaAuthStore
    readonly signal: WaSignalStore
    readonly senderKey: WaSenderKeyStore
    readonly appState: WaAppStateStore
    readonly retry: WaRetryStore
    readonly participants: WaParticipantsStore
    readonly deviceList: WaDeviceListStore
    readonly messages: WaMessageStore
    readonly threads: WaThreadStore
    readonly contacts: WaContactStore
    readonly privacyToken: WaPrivacyTokenStore
    destroyCaches(): Promise<void>
    destroy(): Promise<void>
}

export interface WaStore {
    session(sessionId: string): WaStoreSession
    destroyCaches(): Promise<void>
    destroy(): Promise<void>
}

export interface WaStoreProviderSelection {
    readonly auth?: 'sqlite'
    readonly signal?: 'sqlite' | 'memory'
    readonly senderKey?: 'sqlite' | 'memory'
    readonly appState?: 'sqlite' | 'memory'
    readonly messages?: 'none' | 'sqlite' | 'memory'
    readonly threads?: 'none' | 'sqlite' | 'memory'
    readonly contacts?: 'none' | 'sqlite' | 'memory'
    readonly privacyToken?: 'sqlite' | 'memory'
}

export interface WaStoreCacheProviderSelection {
    readonly retry?: 'sqlite' | 'memory'
    readonly participants?: 'none' | 'sqlite' | 'memory'
    readonly deviceList?: 'none' | 'sqlite' | 'memory'
}

export interface WaStoreCacheTtlSelection {
    readonly retryMs?: number
    readonly participantsMs?: number
    readonly deviceListMs?: number
}

export interface WaStoreSqliteBatchSizeSelection {
    readonly deviceList?: number
    readonly senderKeyDistribution?: number
    readonly signalPreKey?: number
    readonly signalHasSession?: number
}

export interface WaStoreMemoryLimitSelection {
    readonly appStateSyncKeys?: number
    readonly appStateCollectionEntries?: number
    readonly signalPreKeys?: number
    readonly signalSessions?: number
    readonly signalRemoteIdentities?: number
    readonly senderKeys?: number
    readonly senderDistributions?: number
    readonly participantsGroups?: number
    readonly deviceListUsers?: number
    readonly messages?: number
    readonly threads?: number
    readonly contacts?: number
    readonly privacyTokens?: number
}

export type WaStoreDomainValueOrFactory<T> = T | ((sessionId: string) => T)

export interface WaCreateStoreCustomProviders {
    readonly auth?: WaStoreDomainValueOrFactory<WaAuthStore>
    readonly signal?: WaStoreDomainValueOrFactory<WaSignalStore>
    readonly senderKey?: WaStoreDomainValueOrFactory<WaSenderKeyStore>
    readonly appState?: WaStoreDomainValueOrFactory<WaAppStateStore>
    readonly messages?: WaStoreDomainValueOrFactory<WaMessageStore>
    readonly threads?: WaStoreDomainValueOrFactory<WaThreadStore>
    readonly contacts?: WaStoreDomainValueOrFactory<WaContactStore>
    readonly privacyToken?: WaStoreDomainValueOrFactory<WaPrivacyTokenStore>
}

export interface WaCreateStoreCustomCacheProviders {
    readonly retry?: WaStoreDomainValueOrFactory<WaRetryStore>
    readonly participants?: WaStoreDomainValueOrFactory<WaParticipantsStore>
    readonly deviceList?: WaStoreDomainValueOrFactory<WaDeviceListStore>
}

export interface WaCreateStoreOptions {
    readonly sqlite?: Omit<WaSqliteStorageOptions, 'sessionId'> & {
        readonly batchSizes?: WaStoreSqliteBatchSizeSelection
    }
    readonly memory?: {
        readonly limits?: WaStoreMemoryLimitSelection
    }
    readonly providers?: WaStoreProviderSelection
    readonly cacheProviders?: WaStoreCacheProviderSelection
    readonly cacheTtlMs?: WaStoreCacheTtlSelection
    readonly custom?: WaCreateStoreCustomProviders
    readonly customCache?: WaCreateStoreCustomCacheProviders
}
