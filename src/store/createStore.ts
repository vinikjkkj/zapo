import { withAppStateLock } from '@store/locks/appstate.lock'
import { withAuthLock } from '@store/locks/auth.lock'
import { withContactLock } from '@store/locks/contact.lock'
import { withDeviceListLock } from '@store/locks/device-list.lock'
import { withMessageLock } from '@store/locks/message.lock'
import { withParticipantsLock } from '@store/locks/participants.lock'
import { withRetryLock } from '@store/locks/retry.lock'
import { withSenderKeyLock } from '@store/locks/sender-key.lock'
import { withSignalLock } from '@store/locks/signal.lock'
import { withThreadLock } from '@store/locks/thread.lock'
import {
    NOOP_CONTACT_STORE,
    NOOP_DEVICE_LIST_STORE,
    NOOP_MESSAGE_STORE,
    NOOP_PARTICIPANTS_STORE,
    NOOP_THREAD_STORE
} from '@store/noop.store'
import { WaAppStateMemoryStore } from '@store/providers/memory/appstate.store'
import { WaContactMemoryStore } from '@store/providers/memory/contact.store'
import { WaDeviceListMemoryStore } from '@store/providers/memory/device-list.store'
import { WaMessageMemoryStore } from '@store/providers/memory/message.store'
import { WaParticipantsMemoryStore } from '@store/providers/memory/participants.store'
import { WaRetryMemoryStore } from '@store/providers/memory/retry.store'
import { SenderKeyMemoryStore } from '@store/providers/memory/sender-key.store'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'
import { WaThreadMemoryStore } from '@store/providers/memory/thread.store'
import { WaAppStateSqliteStore } from '@store/providers/sqlite/appstate.store'
import { WaAuthSqliteStore } from '@store/providers/sqlite/auth.store'
import { WaContactSqliteStore } from '@store/providers/sqlite/contact.store'
import { WaDeviceListSqliteStore } from '@store/providers/sqlite/device-list.store'
import { WaMessageSqliteStore } from '@store/providers/sqlite/message.store'
import { WaParticipantsSqliteStore } from '@store/providers/sqlite/participants.store'
import { WaRetrySqliteStore } from '@store/providers/sqlite/retry.store'
import { SenderKeySqliteStore } from '@store/providers/sqlite/sender-key.store'
import { WaSignalSqliteStore } from '@store/providers/sqlite/signal.store'
import { WaThreadSqliteStore } from '@store/providers/sqlite/thread.store'
import type {
    WaCreateStoreOptions,
    WaStore,
    WaStoreCacheProviderSelection,
    WaStoreCacheTtlSelection,
    WaStoreDomainValueOrFactory,
    WaStoreMemoryLimitSelection,
    WaStoreProviderSelection,
    WaStoreSqliteBatchSizeSelection,
    WaStoreSession
} from '@store/types'
import { resolvePositive } from '@util/coercion'

interface Destroyable {
    destroy: () => void | Promise<void>
}

const DEFAULT_PROVIDERS: Required<WaStoreProviderSelection> = {
    auth: 'sqlite',
    signal: 'sqlite',
    senderKey: 'sqlite',
    appState: 'sqlite',
    messages: 'none',
    threads: 'none',
    contacts: 'none'
}

const DEFAULT_CACHE_PROVIDERS: Required<WaStoreCacheProviderSelection> = {
    retry: 'memory',
    participants: 'memory',
    deviceList: 'memory'
}

const DEFAULT_CACHE_TTLS_MS: Required<WaStoreCacheTtlSelection> = {
    retryMs: 60 * 1000,
    participantsMs: 5 * 60 * 1000,
    deviceListMs: 5 * 60 * 1000
}

const DEFAULT_SQLITE_BATCH_SIZES: Required<WaStoreSqliteBatchSizeSelection> = {
    deviceList: 500,
    senderKeyDistribution: 250,
    signalPreKey: 500,
    signalHasSession: 250
}

function resolveStoreValue<T>(
    sessionId: string,
    value: WaStoreDomainValueOrFactory<T> | undefined,
    domainPath: string
): T | null {
    if (!value) {
        return null
    }
    const resolved = typeof value === 'function' ? (value as (id: string) => T)(sessionId) : value
    if (!resolved) {
        throw new Error(`${domainPath} must resolve to a store instance`)
    }
    return resolved
}

function hasDestroy(value: unknown): value is Destroyable {
    return (
        !!value &&
        typeof value === 'object' &&
        'destroy' in value &&
        typeof (value as Destroyable).destroy === 'function'
    )
}

async function destroyIfSupported(value: unknown): Promise<void> {
    if (!hasDestroy(value)) {
        return
    }
    await value.destroy()
}

export function createStore(options: WaCreateStoreOptions): WaStore {
    const providers: Required<WaStoreProviderSelection> = {
        ...DEFAULT_PROVIDERS,
        ...(options.providers ?? {})
    }
    const cacheProviders: Required<WaStoreCacheProviderSelection> = {
        ...DEFAULT_CACHE_PROVIDERS,
        ...(options.cacheProviders ?? {})
    }
    const cacheTtlsMs = Object.freeze({
        retry: resolvePositive(
            options.cacheTtlMs?.retryMs,
            DEFAULT_CACHE_TTLS_MS.retryMs,
            'cacheTtlMs.retryMs'
        ),
        participants: resolvePositive(
            options.cacheTtlMs?.participantsMs,
            DEFAULT_CACHE_TTLS_MS.participantsMs,
            'cacheTtlMs.participantsMs'
        ),
        deviceList: resolvePositive(
            options.cacheTtlMs?.deviceListMs,
            DEFAULT_CACHE_TTLS_MS.deviceListMs,
            'cacheTtlMs.deviceListMs'
        )
    } as const)
    const sqliteBatchSizes = Object.freeze({
        deviceList: resolvePositive(
            options.sqlite?.batchSizes?.deviceList,
            DEFAULT_SQLITE_BATCH_SIZES.deviceList,
            'sqlite.batchSizes.deviceList'
        ),
        senderKeyDistribution: resolvePositive(
            options.sqlite?.batchSizes?.senderKeyDistribution,
            DEFAULT_SQLITE_BATCH_SIZES.senderKeyDistribution,
            'sqlite.batchSizes.senderKeyDistribution'
        ),
        signalPreKey: resolvePositive(
            options.sqlite?.batchSizes?.signalPreKey,
            DEFAULT_SQLITE_BATCH_SIZES.signalPreKey,
            'sqlite.batchSizes.signalPreKey'
        ),
        signalHasSession: resolvePositive(
            options.sqlite?.batchSizes?.signalHasSession,
            DEFAULT_SQLITE_BATCH_SIZES.signalHasSession,
            'sqlite.batchSizes.signalHasSession'
        )
    } as const)
    const sessions = new Map<string, WaStoreSession>()
    let storeDestroyed = false

    return {
        session(sessionId: string): WaStoreSession {
            if (storeDestroyed) {
                throw new Error('store has been destroyed')
            }

            const normalizedSessionId = sessionId.trim()
            if (normalizedSessionId.length === 0) {
                throw new Error('sessionId must be a non-empty string')
            }

            const cached = sessions.get(normalizedSessionId)
            if (cached) {
                return cached
            }

            const resolveCustom = <T>(
                value: WaStoreDomainValueOrFactory<T> | undefined,
                domainPath: string
            ): T | null => resolveStoreValue(normalizedSessionId, value, domainPath)
            const customAuth = resolveCustom(options.custom?.auth, 'custom.auth')
            const customSignal = resolveCustom(options.custom?.signal, 'custom.signal')
            const customSenderKey = resolveCustom(options.custom?.senderKey, 'custom.senderKey')
            const customAppState = resolveCustom(options.custom?.appState, 'custom.appState')
            const customRetry = resolveCustom(options.customCache?.retry, 'customCache.retry')
            const customParticipants = resolveCustom(
                options.customCache?.participants,
                'customCache.participants'
            )
            const customDeviceList = resolveCustom(
                options.customCache?.deviceList,
                'customCache.deviceList'
            )
            const customMessages = resolveCustom(options.custom?.messages, 'custom.messages')
            const customThreads = resolveCustom(options.custom?.threads, 'custom.threads')
            const customContacts = resolveCustom(options.custom?.contacts, 'custom.contacts')
            const memoryLimits: WaStoreMemoryLimitSelection = options.memory?.limits ?? {}

            const requiresSqlite =
                !customAuth ||
                (!customSignal && providers.signal === 'sqlite') ||
                (!customSenderKey && providers.senderKey === 'sqlite') ||
                (!customAppState && providers.appState === 'sqlite') ||
                (!customRetry && cacheProviders.retry === 'sqlite') ||
                (!customParticipants && cacheProviders.participants === 'sqlite') ||
                (!customDeviceList && cacheProviders.deviceList === 'sqlite') ||
                (!customMessages && providers.messages === 'sqlite') ||
                (!customThreads && providers.threads === 'sqlite') ||
                (!customContacts && providers.contacts === 'sqlite')

            const sqlite = options.sqlite
            if (requiresSqlite && (!sqlite?.path || sqlite.path.trim().length === 0)) {
                throw new Error('sqlite.path must be configured for unresolved sqlite domains.')
            }

            const sqliteOptions =
                sqlite && sqlite.path.trim().length > 0
                    ? ({
                          path: sqlite.path,
                          sessionId: normalizedSessionId,
                          driver: sqlite.driver ?? 'auto',
                          pragmas: sqlite.pragmas,
                          tableNames: sqlite.tableNames
                      } as const)
                    : null

            const rawAuthStore = customAuth ?? new WaAuthSqliteStore(sqliteOptions!)
            const rawSignalStore =
                customSignal ??
                (providers.signal === 'memory'
                    ? new WaSignalMemoryStore({
                          maxPreKeys: memoryLimits.signalPreKeys,
                          maxSessions: memoryLimits.signalSessions,
                          maxRemoteIdentities: memoryLimits.signalRemoteIdentities
                      })
                    : new WaSignalSqliteStore(sqliteOptions!, {
                          preKeyBatchSize: sqliteBatchSizes.signalPreKey,
                          hasSessionBatchSize: sqliteBatchSizes.signalHasSession
                      }))
            const rawSenderKeyStore =
                customSenderKey ??
                (providers.senderKey === 'memory'
                    ? new SenderKeyMemoryStore({
                          maxSenderKeys: memoryLimits.senderKeys,
                          maxSenderDistributions: memoryLimits.senderDistributions
                      })
                    : new SenderKeySqliteStore(
                          sqliteOptions!,
                          sqliteBatchSizes.senderKeyDistribution
                      ))
            const rawAppStateStore =
                customAppState ??
                (providers.appState === 'memory'
                    ? new WaAppStateMemoryStore(undefined, {
                          maxSyncKeys: memoryLimits.appStateSyncKeys,
                          maxCollectionEntries: memoryLimits.appStateCollectionEntries
                      })
                    : new WaAppStateSqliteStore(sqliteOptions!))
            const rawRetryStore =
                customRetry ??
                (cacheProviders.retry === 'memory'
                    ? new WaRetryMemoryStore(cacheTtlsMs.retry)
                    : new WaRetrySqliteStore(sqliteOptions!, cacheTtlsMs.retry))
            const rawParticipantsStore =
                customParticipants ??
                (cacheProviders.participants === 'sqlite'
                    ? new WaParticipantsSqliteStore(sqliteOptions!, cacheTtlsMs.participants)
                    : cacheProviders.participants === 'memory'
                      ? new WaParticipantsMemoryStore(cacheTtlsMs.participants, {
                            maxGroups: memoryLimits.participantsGroups
                        })
                      : NOOP_PARTICIPANTS_STORE)
            const rawDeviceListStore =
                customDeviceList ??
                (cacheProviders.deviceList === 'sqlite'
                    ? new WaDeviceListSqliteStore(
                          sqliteOptions!,
                          cacheTtlsMs.deviceList,
                          sqliteBatchSizes.deviceList
                      )
                    : cacheProviders.deviceList === 'memory'
                      ? new WaDeviceListMemoryStore(cacheTtlsMs.deviceList, {
                            maxUsers: memoryLimits.deviceListUsers
                        })
                      : NOOP_DEVICE_LIST_STORE)
            const rawMessageStore =
                customMessages ??
                (providers.messages === 'sqlite'
                    ? new WaMessageSqliteStore(sqliteOptions!)
                    : providers.messages === 'memory'
                      ? new WaMessageMemoryStore({
                            maxMessages: memoryLimits.messages
                        })
                      : NOOP_MESSAGE_STORE)
            const rawThreadStore =
                customThreads ??
                (providers.threads === 'sqlite'
                    ? new WaThreadSqliteStore(sqliteOptions!)
                    : providers.threads === 'memory'
                      ? new WaThreadMemoryStore({
                            maxThreads: memoryLimits.threads
                        })
                      : NOOP_THREAD_STORE)
            const rawContactStore =
                customContacts ??
                (providers.contacts === 'sqlite'
                    ? new WaContactSqliteStore(sqliteOptions!)
                    : providers.contacts === 'memory'
                      ? new WaContactMemoryStore({
                            maxContacts: memoryLimits.contacts
                        })
                      : NOOP_CONTACT_STORE)

            const authStore = withAuthLock(rawAuthStore)
            const signalStore = withSignalLock(rawSignalStore)
            const senderKeyStore = withSenderKeyLock(rawSenderKeyStore)
            const appStateStore = withAppStateLock(rawAppStateStore)
            const retryStore = withRetryLock(rawRetryStore)
            const participantsStore = withParticipantsLock(rawParticipantsStore)
            const deviceListStore = withDeviceListLock(rawDeviceListStore)
            const messageStore = withMessageLock(rawMessageStore)
            const threadStore = withThreadLock(rawThreadStore)
            const contactStore = withContactLock(rawContactStore)

            let cachesDestroyed = false
            let sessionDestroyed = false

            const destroyCaches = async (): Promise<void> => {
                if (cachesDestroyed) {
                    return
                }
                cachesDestroyed = true
                await Promise.all([
                    retryStore.clear(),
                    participantsStore.clear(),
                    deviceListStore.clear()
                ])
                await Promise.all([
                    destroyIfSupported(retryStore),
                    destroyIfSupported(participantsStore),
                    destroyIfSupported(deviceListStore)
                ])
            }

            const destroy = async (): Promise<void> => {
                if (sessionDestroyed) {
                    return
                }
                sessionDestroyed = true
                await destroyCaches()
                await Promise.all([
                    destroyIfSupported(authStore),
                    destroyIfSupported(signalStore),
                    destroyIfSupported(senderKeyStore),
                    destroyIfSupported(appStateStore),
                    destroyIfSupported(messageStore),
                    destroyIfSupported(threadStore),
                    destroyIfSupported(contactStore)
                ])
            }

            const session: WaStoreSession = {
                auth: authStore,
                signal: signalStore,
                senderKey: senderKeyStore,
                appState: appStateStore,
                retry: retryStore,
                participants: participantsStore,
                deviceList: deviceListStore,
                messages: messageStore,
                threads: threadStore,
                contacts: contactStore,
                destroyCaches,
                destroy
            }

            sessions.set(normalizedSessionId, session)
            return session
        },

        async destroyCaches(): Promise<void> {
            for (const session of sessions.values()) {
                await session.destroyCaches()
            }
        },

        async destroy(): Promise<void> {
            if (storeDestroyed) {
                return
            }
            storeDestroyed = true
            for (const [sessionId, session] of sessions) {
                sessions.delete(sessionId)
                await session.destroy()
            }
        }
    }
}
