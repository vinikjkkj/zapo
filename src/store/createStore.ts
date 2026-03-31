import type { WaAppStateStore } from '@store/contracts/appstate.store'
import type { WaAuthStore } from '@store/contracts/auth.store'
import type { WaContactStore } from '@store/contracts/contact.store'
import type { WaDeviceListStore } from '@store/contracts/device-list.store'
import type { WaIdentityStore } from '@store/contracts/identity.store'
import type { WaMessageSecretStore } from '@store/contracts/message-secret.store'
import type { WaMessageStore } from '@store/contracts/message.store'
import type { WaParticipantsStore } from '@store/contracts/participants.store'
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
import { withIdentityLock } from '@store/locks/identity.lock'
import { withMessageSecretLock } from '@store/locks/message-secret.lock'
import { withMessageLock } from '@store/locks/message.lock'
import { withParticipantsLock } from '@store/locks/participants.lock'
import { withPreKeyLock } from '@store/locks/pre-key.lock'
import { withPrivacyTokenLock } from '@store/locks/privacy-token.lock'
import { withRetryLock } from '@store/locks/retry.lock'
import { withSenderKeyLock } from '@store/locks/sender-key.lock'
import { withSessionLock } from '@store/locks/session.lock'
import { withSignalLock } from '@store/locks/signal.lock'
import { withThreadLock } from '@store/locks/thread.lock'
import {
    NOOP_CONTACT_STORE,
    NOOP_DEVICE_LIST_STORE,
    NOOP_MESSAGE_SECRET_STORE,
    NOOP_MESSAGE_STORE,
    NOOP_PARTICIPANTS_STORE,
    NOOP_RETRY_STORE,
    NOOP_THREAD_STORE
} from '@store/noop.store'
import { WaAppStateMemoryStore } from '@store/providers/memory/appstate.store'
import { WaContactMemoryStore } from '@store/providers/memory/contact.store'
import { WaDeviceListMemoryStore } from '@store/providers/memory/device-list.store'
import { WaIdentityMemoryStore } from '@store/providers/memory/identity.store'
import { WaMessageSecretMemoryStore } from '@store/providers/memory/message-secret.store'
import { WaMessageMemoryStore } from '@store/providers/memory/message.store'
import { WaParticipantsMemoryStore } from '@store/providers/memory/participants.store'
import { WaPreKeyMemoryStore } from '@store/providers/memory/pre-key.store'
import { WaPrivacyTokenMemoryStore } from '@store/providers/memory/privacy-token.store'
import { WaRetryMemoryStore } from '@store/providers/memory/retry.store'
import { SenderKeyMemoryStore } from '@store/providers/memory/sender-key.store'
import { WaSessionMemoryStore } from '@store/providers/memory/session.store'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'
import { WaThreadMemoryStore } from '@store/providers/memory/thread.store'
import type {
    WaCreateStoreOptions,
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
    participantsMs: 5 * 60 * 1000,
    deviceListMs: 5 * 60 * 1000,
    messageSecretMs: 30 * 60 * 1000
} as const)

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

export function createStore<B extends string>(options: WaCreateStoreOptions<B>): WaStore {
    const backends = (options.backends ?? {}) as Readonly<Record<string, WaStoreBackend>>
    const providers = options.providers ?? {}
    const cacheProviders = options.cacheProviders ?? {}
    const cacheTtlsMs = Object.freeze({
        retry: resolvePositive(
            options.memory?.cacheTtlMs?.retryMs,
            DEFAULT_CACHE_TTLS_MS.retryMs,
            'memory.cacheTtlMs.retryMs'
        ),
        participants: resolvePositive(
            options.memory?.cacheTtlMs?.participantsMs,
            DEFAULT_CACHE_TTLS_MS.participantsMs,
            'memory.cacheTtlMs.participantsMs'
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
                providers.auth,
                'auth',
                'stores',
                () => {
                    throw new Error(
                        'providers.auth is required — register a backend or set providers.auth'
                    )
                }
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
                              maxInboundCounters: ml.retryInboundCounters
                          })
                        : NOOP_RETRY_STORE
            )
            const rawParticipants = resolveStore<WaParticipantsStore>(
                id,
                backends,
                cacheProviders.participants ?? 'memory',
                'participants',
                'caches',
                () =>
                    cacheProviders.participants === 'memory'
                        ? new WaParticipantsMemoryStore(cacheTtlsMs.participants, {
                              maxGroups: ml.participantsGroups
                          })
                        : NOOP_PARTICIPANTS_STORE
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
                              maxUsers: ml.deviceListUsers
                          })
                        : NOOP_DEVICE_LIST_STORE
            )
            const rawMessageSecret = resolveStore<WaMessageSecretStore>(
                id,
                backends,
                cacheProviders.messageSecret ?? 'none',
                'messageSecret',
                'caches',
                () =>
                    cacheProviders.messageSecret === 'memory'
                        ? new WaMessageSecretMemoryStore(cacheTtlsMs.messageSecret, {
                              maxSecrets: ml.messageSecrets
                          })
                        : NOOP_MESSAGE_SECRET_STORE
            )

            const authStore = withAuthLock(rawAuth)
            const signalStore = withSignalLock(rawSignal)
            const preKeyStore = withPreKeyLock(rawPreKey)
            const sessionStore = withSessionLock(rawSession)
            const identityStore = withIdentityLock(rawIdentity)
            const senderKeyStore = withSenderKeyLock(rawSenderKey)
            const appStateStore = withAppStateLock(rawAppState)
            const retryStore = withRetryLock(rawRetry)
            const participantsStore = withParticipantsLock(rawParticipants)
            const deviceListStore = withDeviceListLock(rawDeviceList)
            const messageStore = withMessageLock(rawMessages)
            const messageSecretStore = withMessageSecretLock(rawMessageSecret)
            const threadStore = withThreadLock(rawThreads)
            const contactStore = withContactLock(rawContacts)
            const privacyTokenStore = withPrivacyTokenLock(rawPrivacyToken)

            let cachesDestroyed = false
            let sessionDestroyed = false

            const destroyCaches = async (): Promise<void> => {
                if (cachesDestroyed) return
                cachesDestroyed = true
                await Promise.all([
                    retryStore.clear(),
                    participantsStore.clear(),
                    deviceListStore.clear(),
                    messageSecretStore.clear()
                ])
                await Promise.all([
                    destroyIfSupported(retryStore),
                    destroyIfSupported(participantsStore),
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
                participants: participantsStore,
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
