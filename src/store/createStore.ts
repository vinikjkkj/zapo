import type { WaContactStore, WaStoredContactRecord } from '@store/contracts/contact.store'
import type { WaMessageStore, WaStoredMessageRecord } from '@store/contracts/message.store'
import type { WaStoredThreadRecord, WaThreadStore } from '@store/contracts/thread.store'
import { WaAppStateMemoryStore } from '@store/providers/memory/appstate.store'
import { WaContactMemoryStore } from '@store/providers/memory/contact.store'
import { WaMessageMemoryStore } from '@store/providers/memory/message.store'
import { WaRetryMemoryStore } from '@store/providers/memory/retry.store'
import { SenderKeyMemoryStore } from '@store/providers/memory/sender-key.store'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'
import { WaThreadMemoryStore } from '@store/providers/memory/thread.store'
import { WaAppStateSqliteStore } from '@store/providers/sqlite/appstate.store'
import { WaAuthSqliteStore } from '@store/providers/sqlite/auth.store'
import { WaContactSqliteStore } from '@store/providers/sqlite/contact.store'
import { WaMessageSqliteStore } from '@store/providers/sqlite/message.store'
import { WaRetrySqliteStore } from '@store/providers/sqlite/retry.store'
import { SenderKeySqliteStore } from '@store/providers/sqlite/sender-key.store'
import { WaSignalSqliteStore } from '@store/providers/sqlite/signal.store'
import { WaThreadSqliteStore } from '@store/providers/sqlite/thread.store'
import type {
    WaCreateStoreCustomProviders,
    WaCreateStoreOptions,
    WaStore,
    WaStoreDomainValueOrFactory,
    WaStoreProviderSelection,
    WaStoreSession
} from '@store/types'

const EMPTY_STORE_LIST = Object.freeze([]) as readonly unknown[]

const NOOP_MESSAGE_STORE: WaMessageStore = Object.freeze({
    upsert: async (_record: WaStoredMessageRecord): Promise<void> => {},
    getById: async (_id: string): Promise<WaStoredMessageRecord | null> => null,
    listByThread: async (
        _threadJid: string,
        _limit?: number,
        _beforeTimestampMs?: number
    ): Promise<readonly WaStoredMessageRecord[]> =>
        EMPTY_STORE_LIST as readonly WaStoredMessageRecord[],
    deleteById: async (_id: string): Promise<number> => 0,
    clear: async (): Promise<void> => {}
})

const NOOP_THREAD_STORE: WaThreadStore = Object.freeze({
    upsert: async (_record: WaStoredThreadRecord): Promise<void> => {},
    getByJid: async (_jid: string): Promise<WaStoredThreadRecord | null> => null,
    list: async (_limit?: number): Promise<readonly WaStoredThreadRecord[]> =>
        EMPTY_STORE_LIST as readonly WaStoredThreadRecord[],
    deleteByJid: async (_jid: string): Promise<number> => 0,
    clear: async (): Promise<void> => {}
})

const NOOP_CONTACT_STORE: WaContactStore = Object.freeze({
    upsert: async (_record: WaStoredContactRecord): Promise<void> => {},
    getByJid: async (_jid: string): Promise<WaStoredContactRecord | null> => null,
    deleteByJid: async (_jid: string): Promise<number> => 0,
    clear: async (): Promise<void> => {}
})

const DEFAULT_PROVIDERS: Required<WaStoreProviderSelection> = {
    auth: 'sqlite',
    signal: 'sqlite',
    senderKey: 'sqlite',
    appState: 'sqlite',
    retry: 'sqlite',
    messages: 'none',
    threads: 'none',
    contacts: 'none'
}

function resolveStoreValue<T>(
    sessionId: string,
    value: WaStoreDomainValueOrFactory<T> | undefined,
    domain: keyof WaCreateStoreCustomProviders
): T | null {
    if (!value) {
        return null
    }
    const resolved = typeof value === 'function' ? (value as (id: string) => T)(sessionId) : value
    if (!resolved) {
        throw new Error(`custom.${domain} must resolve to a store instance`)
    }
    return resolved
}

export function createStore(options: WaCreateStoreOptions): WaStore {
    const providers: Required<WaStoreProviderSelection> = {
        ...DEFAULT_PROVIDERS,
        ...(options.providers ?? {})
    }
    const sessions = new Map<string, WaStoreSession>()

    return {
        session(sessionId: string): WaStoreSession {
            const normalizedSessionId = sessionId.trim()
            if (normalizedSessionId.length === 0) {
                throw new Error('sessionId must be a non-empty string')
            }

            const cached = sessions.get(normalizedSessionId)
            if (cached) {
                return cached
            }

            const custom = options.custom
            const customAuth = resolveStoreValue(normalizedSessionId, custom?.auth, 'auth')
            const customSignal = resolveStoreValue(normalizedSessionId, custom?.signal, 'signal')
            const customSenderKey = resolveStoreValue(
                normalizedSessionId,
                custom?.senderKey,
                'senderKey'
            )
            const customAppState = resolveStoreValue(
                normalizedSessionId,
                custom?.appState,
                'appState'
            )
            const customRetry = resolveStoreValue(normalizedSessionId, custom?.retry, 'retry')
            const customMessages = resolveStoreValue(
                normalizedSessionId,
                custom?.messages,
                'messages'
            )
            const customThreads = resolveStoreValue(normalizedSessionId, custom?.threads, 'threads')
            const customContacts = resolveStoreValue(
                normalizedSessionId,
                custom?.contacts,
                'contacts'
            )

            const requiresSqlite =
                !customAuth ||
                (!customSignal && providers.signal === 'sqlite') ||
                (!customSenderKey && providers.senderKey === 'sqlite') ||
                (!customAppState && providers.appState === 'sqlite') ||
                (!customRetry && providers.retry === 'sqlite') ||
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
                          pragmas: sqlite.pragmas
                      } as const)
                    : null

            const session: WaStoreSession = {
                auth: customAuth ?? new WaAuthSqliteStore(sqliteOptions!),
                signal:
                    customSignal ??
                    (providers.signal === 'memory'
                        ? new WaSignalMemoryStore()
                        : new WaSignalSqliteStore(sqliteOptions!)),
                senderKey:
                    customSenderKey ??
                    (providers.senderKey === 'memory'
                        ? new SenderKeyMemoryStore()
                        : new SenderKeySqliteStore(sqliteOptions!)),
                appState:
                    customAppState ??
                    (providers.appState === 'memory'
                        ? new WaAppStateMemoryStore()
                        : new WaAppStateSqliteStore(sqliteOptions!)),
                retry:
                    customRetry ??
                    (providers.retry === 'memory'
                        ? new WaRetryMemoryStore()
                        : new WaRetrySqliteStore(sqliteOptions!)),
                messages:
                    customMessages ??
                    (providers.messages === 'sqlite'
                        ? new WaMessageSqliteStore(sqliteOptions!)
                        : providers.messages === 'memory'
                          ? new WaMessageMemoryStore()
                          : NOOP_MESSAGE_STORE),
                threads:
                    customThreads ??
                    (providers.threads === 'sqlite'
                        ? new WaThreadSqliteStore(sqliteOptions!)
                        : providers.threads === 'memory'
                          ? new WaThreadMemoryStore()
                          : NOOP_THREAD_STORE),
                contacts:
                    customContacts ??
                    (providers.contacts === 'sqlite'
                        ? new WaContactSqliteStore(sqliteOptions!)
                        : providers.contacts === 'memory'
                          ? new WaContactMemoryStore()
                          : NOOP_CONTACT_STORE)
            }

            sessions.set(normalizedSessionId, session)
            return session
        }
    }
}
