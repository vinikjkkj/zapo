import { withIdentityCache } from '@store/cache/identity.cache'
import { withPrivacyTokenCache } from '@store/cache/privacy-token.cache'
import { withSenderKeyCache } from '@store/cache/sender-key.cache'
import { withSessionCache } from '@store/cache/session.cache'
import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaGroupMetadataStore } from '@store/contracts/group-metadata.store'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WaPreKeyStore } from '@store/contracts/pre-key.store'
import type { WaPrivacyTokenStore } from '@store/contracts/privacy-token.store'
import type { WaRetryStore } from '@store/contracts/retry.store'
import type { WaSenderKeyStore } from '@store/contracts/sender-key.store'
import type { WaSessionStore } from '@store/contracts/session.store'
import type { WaSignalStore } from '@store/contracts/signal.store'
import type { WaThreadStore } from '@store/contracts/thread.store'
import { withAppStateLock } from '@store/locks/appstate.lock'
import { withAuthLock } from '@store/locks/auth.lock'
import { withContactLock } from '@store/locks/contact.lock'
import { withDeviceListLock } from '@store/locks/device-list.lock'
import { withGroupMetadataLock } from '@store/locks/group-metadata.lock'
import { withIdentityLock } from '@store/locks/identity.lock'
import { withMessageSecretLock } from '@store/locks/message-secret.lock'
import { withMessageLock } from '@store/locks/message.lock'
import { withPreKeyLock } from '@store/locks/pre-key.lock'
import { withPrivacyTokenLock } from '@store/locks/privacy-token.lock'
import { withRetryLock } from '@store/locks/retry.lock'
import { withSenderKeyLock } from '@store/locks/sender-key.lock'
import { withSessionLock } from '@store/locks/session.lock'
import { withSignalLock } from '@store/locks/signal.lock'
import { withThreadLock } from '@store/locks/thread.lock'
import { WaAppStateMemoryStore } from '@store/memory/appstate.store'
import { WaAuthMemoryStore } from '@store/memory/auth.store'
import { WaContactMemoryStore } from '@store/memory/contact.store'
import { WaDeviceListMemoryStore } from '@store/memory/device-list.store'
import { WaGroupMetadataMemoryStore } from '@store/memory/group-metadata.store'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaMessageSecretMemoryStore } from '@store/memory/message-secret.store'
import { WaMessageMemoryStore } from '@store/memory/message.store'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import { WaRetryMemoryStore } from '@store/memory/retry.store'
import { SenderKeyMemoryStore } from '@store/memory/sender-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'
import { WaThreadMemoryStore } from '@store/memory/thread.store'
import {
    NOOP_CONTACT_STORE,
    NOOP_DEVICE_LIST_STORE,
    NOOP_GROUP_METADATA_STORE,
    NOOP_MESSAGE_SECRET_STORE,
    NOOP_MESSAGE_STORE,
    NOOP_RETRY_STORE,
    NOOP_THREAD_STORE
} from '@store/noop.store'
import type {
    WaCreateStoreOptions,
    WaCreateStoreOptionsStrict,
    WaStore,
    WaStoreBackend,
    WaStoreMemoryLimitSelection,
    WaStoreSession
} from '@store/types'
import { resolvePositive } from '@util/coercion'

interface Destroyable {
    destroy: () => void | Promise<void>
}

const DEFAULT_CACHE_TTLS_MS = Object.freeze({
    retryMs: 60 * 1000,
    groupMetadataMs: 5 * 60 * 1000,
    deviceListMs: 5 * 60 * 1000,
    messageSecretMs: 30 * 60 * 1000
} as const)

const REQUIRED_PROVIDER_DOMAINS = [
    'auth',
    'signal',
    'preKey',
    'session',
    'identity',
    'senderKey',
    'appState',
    'messages',
    'threads',
    'contacts',
    'privacyToken'
] as const

function hasDestroy(value: unknown): value is Destroyable {
    return (
        !!value &&
        typeof value === 'object' &&
        'destroy' in value &&
        typeof (value as Destroyable).destroy === 'function'
    )
}

async function destroyIfSupported(value: unknown): Promise<void> {
    if (!hasDestroy(value)) return
    await value.destroy()
}

function usesBackend(provider: string | undefined): boolean {
    return !!provider && provider !== 'memory' && provider !== 'none'
}

function resolveStore<T>(
    sessionId: string,
    backends: Readonly<Record<string, WaStoreBackend>>,
    provider: string | undefined,
    domain: string,
    kind: 'stores' | 'caches',
    fallback: () => T
): T {
    if (!provider || provider === 'memory' || provider === 'none') {
        return fallback()
    }
    const backend = backends[provider]
    if (!backend) {
        throw new Error(`unknown backend '${provider}' for ${domain}`)
    }
    const factory = (backend[kind] as unknown as Record<string, (id: string) => T>)[domain]
    if (!factory) {
        throw new Error(`backend '${provider}' does not provide ${kind}.${domain}`)
    }
    return factory(sessionId)
}

/**
 * Builds a {@link WaStore} from the configured providers/backends. Each call
 * to `store.session(sessionId)` returns a cached, lock-wrapped per-domain
 * store bundle for that session. Cache domains default to bounded memory
 * with the TTLs in `options.memory.cacheTtlMs`.
 *
 * **Defaults policy:**
 * - With `backends` empty (or absent), every domain falls back to memory
 *   (mailbox domains to `'none'`). The session lives only in memory and the
 *   device re-pairs on every restart.
 * - With `backends` set, **every persistence domain must be assigned
 *   explicitly** in `providers` (auth/signal/preKey/session/identity/
 *   senderKey/appState/privacyToken/messages/threads/contacts). The factory
 *   throws listing the missing keys. Pass `'memory'` to keep the in-tree
 *   memory provider for that domain, `'none'` to skip it, or the backend
 *   name to persist. Cache domains (retry/groupMetadata/deviceList/
 *   messageSecret) stay opt-in and default to memory - they are small,
 *   hot, and cheap to rebuild.
 *
 * @example
 * ```ts
 * // Persistent setup with @zapo-js/store-sqlite (recommended for production)
 * import { createSqliteStore } from '@zapo-js/store-sqlite'
 * import { createStore } from 'zapo-js'
 *
 * const store = createStore({
 *     backends: { sqlite: createSqliteStore({ path: '.auth/state.sqlite' }) },
 *     providers: {
 *         auth: 'sqlite',
 *         signal: 'sqlite',
 *         preKey: 'sqlite',
 *         session: 'sqlite',
 *         identity: 'sqlite',
 *         senderKey: 'sqlite',
 *         appState: 'sqlite',
 *         privacyToken: 'sqlite',
 *         messages: 'sqlite',   // 'none' to skip the message archive
 *         threads: 'sqlite',    // 'none' to skip
 *         contacts: 'sqlite'    // 'none' to skip
 *     }
 *     // cacheProviders omitted - retry/groupMetadata/deviceList/
 *     // messageSecret default to memory
 * })
 *
 * // Memory-only (tests / ephemeral sessions - credentials lost on restart)
 * const memStore = createStore({})
 * ```
 */
export function createStore(
    options?: Omit<WaCreateStoreOptions<never>, 'backends' | 'providers'> & {
        readonly backends?: undefined
        readonly providers?: undefined
    }
): WaStore
export function createStore<B extends string>(options: WaCreateStoreOptionsStrict<B>): WaStore
export function createStore<B extends string>(options?: WaCreateStoreOptions<B>): WaStore {
    options = options ?? {}
    const backends = (options.backends ?? {}) as Readonly<Record<string, WaStoreBackend>>
    const providers = options.providers ?? {}
    const cacheProviders = options.cacheProviders ?? {}
    const cacheLayer = options.cacheLayer ?? {}
    const storeLogger = options.logger?.child({ scope: 'store' })
    const memoryLogger = storeLogger?.child({ provider: 'memory' })

    if (Object.keys(backends).length > 0) {
        const missingProviders = REQUIRED_PROVIDER_DOMAINS.filter(
            (domain) => providers[domain] === undefined
        )
        if (missingProviders.length > 0) {
            throw new Error(
                `createStore: when backends is set, every persistence domain must be assigned ` +
                    `explicitly via providers. Missing: ${missingProviders
                        .map((d) => `providers.${d}`)
                        .join(', ')}. Pass a backend name (e.g. 'sqlite') to persist, or ` +
                    `'memory' to use the in-tree memory provider. For the mailbox domains ` +
                    `(messages/threads/contacts) 'none' skips the domain entirely; for the ` +
                    `other domains 'none' falls back to memory. Cache providers ` +
                    `(retry/groupMetadata/deviceList/messageSecret) stay opt-in and default to memory.`
            )
        }
    }
    const cacheTtlsMs = Object.freeze({
        retry: resolvePositive(
            options.memory?.cacheTtlMs?.retryMs,
            DEFAULT_CACHE_TTLS_MS.retryMs,
            'memory.cacheTtlMs.retryMs'
        ),
        groupMetadata: resolvePositive(
            options.memory?.cacheTtlMs?.groupMetadataMs,
            DEFAULT_CACHE_TTLS_MS.groupMetadataMs,
            'memory.cacheTtlMs.groupMetadataMs'
        ),
        deviceList: resolvePositive(
            options.memory?.cacheTtlMs?.deviceListMs,
            DEFAULT_CACHE_TTLS_MS.deviceListMs,
            'memory.cacheTtlMs.deviceListMs'
        ),
        messageSecret: resolvePositive(
            options.memory?.cacheTtlMs?.messageSecretMs,
            DEFAULT_CACHE_TTLS_MS.messageSecretMs,
            'memory.cacheTtlMs.messageSecretMs'
        )
    } as const)
    const sessions = new Map<string, WaStoreSession>()
    let storeDestroyed = false

    return {
        session(sessionId: string): WaStoreSession {
            if (storeDestroyed) {
                throw new Error('store has been destroyed')
            }
            const id = sessionId.trim()
            if (id.length === 0) {
                throw new Error('sessionId must be a non-empty string')
            }
            const cached = sessions.get(id)
            if (cached) return cached

            const ml: WaStoreMemoryLimitSelection = options.memory?.limits ?? {}

            const rawAuth = resolveStore<WaAuthStore>(
                id,
                backends,
                providers.auth ?? 'memory',
                'auth',
                'stores',
                () => new WaAuthMemoryStore()
            )
            const rawSignal = resolveStore<WaSignalStore>(
                id,
                backends,
                providers.signal ?? 'memory',
                'signal',
                'stores',
                () => new WaSignalMemoryStore()
            )
            const rawPreKey = resolveStore<WaPreKeyStore>(
                id,
                backends,
                providers.preKey ?? 'memory',
                'preKey',
                'stores',
                () => new WaPreKeyMemoryStore({ maxPreKeys: ml.signalPreKeys })
            )
            const rawSession = resolveStore<WaSessionStore>(
                id,
                backends,
                providers.session ?? 'memory',
                'session',
                'stores',
                () => new WaSessionMemoryStore({ maxSessions: ml.signalSessions })
            )
            const rawIdentity = resolveStore<WaIdentityStore>(
                id,
                backends,
                providers.identity ?? 'memory',
                'identity',
                'stores',
                () =>
                    new WaIdentityMemoryStore({
                        maxRemoteIdentities: ml.signalRemoteIdentities
                    })
            )
            const rawSenderKey = resolveStore<WaSenderKeyStore>(
                id,
                backends,
                providers.senderKey ?? 'memory',
                'senderKey',
                'stores',
                () =>
                    new SenderKeyMemoryStore({
                        maxSenderKeys: ml.senderKeys,
                        maxSenderDistributions: ml.senderDistributions
                    })
            )
            const rawAppState = resolveStore<WaAppStateStore>(
                id,
                backends,
                providers.appState ?? 'memory',
                'appState',
                'stores',
                () =>
                    new WaAppStateMemoryStore(undefined, {
                        maxSyncKeys: ml.appStateSyncKeys,
                        maxCollectionEntries: ml.appStateCollectionEntries
                    })
            )
            const rawMessages = resolveStore<WaMessageStore>(
                id,
                backends,
                providers.messages ?? 'none',
                'messages',
                'stores',
                () =>
                    providers.messages === 'memory'
                        ? new WaMessageMemoryStore({ maxMessages: ml.messages })
                        : NOOP_MESSAGE_STORE
            )
            const rawThreads = resolveStore<WaThreadStore>(
                id,
                backends,
                providers.threads ?? 'none',
                'threads',
                'stores',
                () =>
                    providers.threads === 'memory'
                        ? new WaThreadMemoryStore({ maxThreads: ml.threads })
                        : NOOP_THREAD_STORE
            )
            const rawContacts = resolveStore<WaContactStore>(
                id,
                backends,
                providers.contacts ?? 'none',
                'contacts',
                'stores',
                () =>
                    providers.contacts === 'memory'
                        ? new WaContactMemoryStore({ maxContacts: ml.contacts })
                        : NOOP_CONTACT_STORE
            )
            const rawPrivacyToken = resolveStore<WaPrivacyTokenStore>(
                id,
                backends,
                providers.privacyToken ?? 'memory',
                'privacyToken',
                'stores',
                () => new WaPrivacyTokenMemoryStore(ml.privacyTokens)
            )
            const rawRetry = resolveStore<WaRetryStore>(
                id,
                backends,
                cacheProviders.retry ?? 'memory',
                'retry',
                'caches',
                () =>
                    cacheProviders.retry === 'memory' || !cacheProviders.retry
                        ? new WaRetryMemoryStore(cacheTtlsMs.retry, {
                              maxOutboundMessages: ml.retryOutboundMessages,
                              maxInboundCounters: ml.retryInboundCounters,
                              logger: memoryLogger?.child({ domain: 'retry', sessionId: id })
                          })
                        : NOOP_RETRY_STORE
            )
            const rawGroupMetadata = resolveStore<WaGroupMetadataStore>(
                id,
                backends,
                cacheProviders.groupMetadata ?? 'memory',
                'groupMetadata',
                'caches',
                () =>
                    cacheProviders.groupMetadata === 'memory' || !cacheProviders.groupMetadata
                        ? new WaGroupMetadataMemoryStore(cacheTtlsMs.groupMetadata, {
                              maxGroups: ml.groupMetadataGroups,
                              logger: memoryLogger?.child({
                                  domain: 'groupMetadata',
                                  sessionId: id
                              })
                          })
                        : NOOP_GROUP_METADATA_STORE
            )
            const rawDeviceList = resolveStore<WaDeviceListStore>(
                id,
                backends,
                cacheProviders.deviceList ?? 'memory',
                'deviceList',
                'caches',
                () =>
                    cacheProviders.deviceList === 'memory'
                        ? new WaDeviceListMemoryStore(cacheTtlsMs.deviceList, {
                              maxUsers: ml.deviceListUsers,
                              logger: memoryLogger?.child({ domain: 'deviceList', sessionId: id })
                          })
                        : NOOP_DEVICE_LIST_STORE
            )
            const rawMessageSecret = resolveStore<WaMessageSecretStore>(
                id,
                backends,
                cacheProviders.messageSecret ?? 'memory',
                'messageSecret',
                'caches',
                () =>
                    cacheProviders.messageSecret === 'memory' || !cacheProviders.messageSecret
                        ? new WaMessageSecretMemoryStore(cacheTtlsMs.messageSecret, {
                              maxSecrets: ml.messageSecrets,
                              logger: memoryLogger?.child({
                                  domain: 'messageSecret',
                                  sessionId: id
                              })
                          })
                        : NOOP_MESSAGE_SECRET_STORE
            )

            const authStore = withAuthLock(rawAuth)
            const signalStore = withSignalLock(rawSignal)
            const preKeyStore = withPreKeyLock(rawPreKey)
            const sessionStore = withSessionLock(
                cacheLayer.session && usesBackend(providers.session)
                    ? withSessionCache(rawSession, cacheLayer.limits?.session)
                    : rawSession
            )
            const identityStore = withIdentityLock(
                cacheLayer.identity && usesBackend(providers.identity)
                    ? withIdentityCache(rawIdentity, cacheLayer.limits?.identity)
                    : rawIdentity
            )
            const senderKeyStore = withSenderKeyLock(
                cacheLayer.senderKey && usesBackend(providers.senderKey)
                    ? withSenderKeyCache(rawSenderKey, cacheLayer.limits?.senderKey)
                    : rawSenderKey
            )
            const appStateStore = withAppStateLock(rawAppState)
            const retryStore = withRetryLock(rawRetry)
            const groupMetadataStore = withGroupMetadataLock(rawGroupMetadata)
            const deviceListStore = withDeviceListLock(rawDeviceList)
            const messageStore = withMessageLock(rawMessages)
            const messageSecretStore = withMessageSecretLock(rawMessageSecret)
            const threadStore = withThreadLock(rawThreads)
            const contactStore = withContactLock(rawContacts)
            const privacyTokenStore = withPrivacyTokenLock(
                cacheLayer.privacyToken && usesBackend(providers.privacyToken)
                    ? withPrivacyTokenCache(rawPrivacyToken, cacheLayer.limits?.privacyToken)
                    : rawPrivacyToken
            )

            let cachesDestroyed = false
            let sessionDestroyed = false

            const destroyCaches = async (): Promise<void> => {
                if (cachesDestroyed) return
                cachesDestroyed = true
                await Promise.all([
                    retryStore.clear(),
                    groupMetadataStore.clear(),
                    deviceListStore.clear(),
                    messageSecretStore.clear()
                ])
                await Promise.all([
                    destroyIfSupported(retryStore),
                    destroyIfSupported(groupMetadataStore),
                    destroyIfSupported(deviceListStore),
                    destroyIfSupported(messageSecretStore)
                ])
            }

            const destroy = async (): Promise<void> => {
                if (sessionDestroyed) return
                sessionDestroyed = true
                await destroyCaches()
                await Promise.all([
                    destroyIfSupported(authStore),
                    destroyIfSupported(signalStore),
                    destroyIfSupported(preKeyStore),
                    destroyIfSupported(sessionStore),
                    destroyIfSupported(identityStore),
                    destroyIfSupported(senderKeyStore),
                    destroyIfSupported(appStateStore),
                    destroyIfSupported(messageStore),
                    destroyIfSupported(threadStore),
                    destroyIfSupported(contactStore),
                    destroyIfSupported(privacyTokenStore)
                ])
            }

            const storeSession: WaStoreSession = {
                auth: authStore,
                signal: signalStore,
                preKey: preKeyStore,
                session: sessionStore,
                identity: identityStore,
                senderKey: senderKeyStore,
                appState: appStateStore,
                retry: retryStore,
                groupMetadata: groupMetadataStore,
                deviceList: deviceListStore,
                messages: messageStore,
                messageSecret: messageSecretStore,
                threads: threadStore,
                contacts: contactStore,
                privacyToken: privacyTokenStore,
                destroyCaches,
                destroy
            }

            sessions.set(id, storeSession)
            return storeSession
        },

        async destroyCaches(): Promise<void> {
            const list = Array.from(sessions.values())
            await Promise.all(list.map((s) => s.destroyCaches()))
        },

        async destroy(): Promise<void> {
            if (storeDestroyed) return
            storeDestroyed = true
            const list = Array.from(sessions.values())
            sessions.clear()
            await Promise.all(list.map((s) => s.destroy()))
            const uniqueBackends = new Set(Object.values(backends))
            await Promise.all(Array.from(uniqueBackends, (backend) => destroyIfSupported(backend)))
        }
    }
}
