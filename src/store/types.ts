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

export interface WaStoreBackend {
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthStore
        readonly signal: (sessionId: string) => WaSignalStore
        readonly senderKey: (sessionId: string) => WaSenderKeyStore
        readonly appState: (sessionId: string) => WaAppStateStore
        readonly messages: (sessionId: string) => WaMessageStore
        readonly threads: (sessionId: string) => WaThreadStore
        readonly contacts: (sessionId: string) => WaContactStore
        readonly privacyToken: (sessionId: string) => WaPrivacyTokenStore
    }
    readonly caches: {
        readonly retry: (sessionId: string) => WaRetryStore
        readonly participants: (sessionId: string) => WaParticipantsStore
        readonly deviceList: (sessionId: string) => WaDeviceListStore
    }
}

export type WaStoreDomain = keyof WaStoreBackend['stores']
export type WaCacheDomain = keyof WaStoreBackend['caches']

export interface WaCreateStoreOptions<B extends string = string> {
    readonly backends?: Readonly<Record<B, WaStoreBackend>>
    readonly providers?: {
        readonly auth?: B | 'memory'
        readonly signal?: B | 'memory'
        readonly senderKey?: B | 'memory'
        readonly appState?: B | 'memory'
        readonly messages?: B | 'memory' | 'none'
        readonly threads?: B | 'memory' | 'none'
        readonly contacts?: B | 'memory' | 'none'
        readonly privacyToken?: B | 'memory'
    }
    readonly cacheProviders?: {
        readonly retry?: B | 'memory'
        readonly participants?: B | 'memory' | 'none'
        readonly deviceList?: B | 'memory' | 'none'
    }
    readonly memory?: {
        readonly limits?: WaStoreMemoryLimitSelection
        readonly cacheTtlMs?: {
            readonly retryMs?: number
            readonly participantsMs?: number
            readonly deviceListMs?: number
        }
    }
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
