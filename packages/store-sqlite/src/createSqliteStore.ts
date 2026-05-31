import type { Logger } from 'zapo-js'

import { WaAppStateSqliteStore } from './appstate.store'
import { WaAuthSqliteStore } from './auth.store'
import type { WaSqliteConnection } from './connection'
import { WaContactSqliteStore } from './contact.store'
import { WaDeviceListSqliteStore } from './device-list.store'
import { WaGroupMetadataSqliteStore } from './group-metadata.store'
import { WaIdentitySqliteStore } from './identity.store'
import { WaMessageSecretSqliteStore } from './message-secret.store'
import { WaMessageSqliteStore } from './message.store'
import { WaPreKeySqliteStore } from './pre-key.store'
import { WaPrivacyTokenSqliteStore } from './privacy-token.store'
import { WaRetrySqliteStore } from './retry.store'
import { SenderKeySqliteStore } from './sender-key.store'
import { WaSessionSqliteStore } from './session.store'
import { WaSignalSqliteStore } from './signal.store'
import { WaThreadSqliteStore } from './thread.store'
import type {
    WaSqliteBatchSizeSelection,
    WaSqliteDriver,
    WaSqliteStorageOptions,
    WaSqliteTableNameOverrides
} from './types'

export interface WaSqliteStoreConfig {
    /**
     * Filesystem path to the SQLite database file. Use `':memory:'` for an
     * in-process ephemeral database (handy in tests). The file is created
     * on first use; migrations run lazily the first time each domain is
     * touched. Mutually exclusive with {@link connection}.
     */
    readonly path?: string
    /**
     * Pre-opened {@link WaSqliteConnection} the stores should reuse instead
     * of opening their own. Mutually exclusive with {@link path}. The
     * caller owns the lifecycle - per-store `destroy()` does not close it,
     * so call `connection.close()` (or your wrapper's dispose) when
     * tearing the app down. Use this to share a single SQLite connection
     * across `zapo-js` and the rest of your application.
     */
    readonly connection?: WaSqliteConnection
    /**
     * SQLite driver selection. Defaults to `'auto'` which prefers
     * `better-sqlite3` on Node and falls back to `bun:sqlite` on Bun.
     * Override only when you need to pin the driver for testing. Ignored
     * when {@link connection} is set.
     */
    readonly driver?: WaSqliteDriver
    /**
     * Extra `PRAGMA` statements applied right after open (e.g.
     * `journal_mode = WAL`, `synchronous = NORMAL`, custom `cache_size`).
     * Library defaults are merged with these on top. Ignored when
     * {@link connection} is set - apply pragmas yourself before passing
     * the connection in.
     */
    readonly pragmas?: Readonly<Record<string, string | number>>
    /**
     * Per-domain table name overrides. Use to share a single SQLite file
     * with another application that already owns the default table names.
     * Ignored when {@link connection} is set - the connection's own
     * table-name resolver is used.
     */
    readonly tableNames?: WaSqliteTableNameOverrides
    /**
     * Per-domain batch sizes for bulk reads (prekey lookups, device-list
     * queries, sender-key distribution checks). Tune up for high-traffic
     * accounts; tune down to reduce per-statement parameter counts.
     */
    readonly batchSizes?: WaSqliteBatchSizeSelection
    /**
     * Override default TTLs (in ms) for the cache domains. Defaults match
     * the in-memory cache TTLs in `createStore`.
     */
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly groupMetadataMs?: number
        readonly deviceListMs?: number
        readonly messageSecretMs?: number
    }
    /**
     * Logger for connection lifecycle, migration progress, and
     * slow-operation warnings. The factory binds `{ scope: 'store',
     * provider: 'sqlite' }` to it, then each per-domain store binds its
     * own `{ domain: '<name>' }`. When unset, the SQLite layer stays
     * silent.
     */
    readonly logger?: Logger
    /**
     * Threshold in milliseconds above which a transaction emits a `warn`.
     * Defaults to `250`.
     */
    readonly slowOperationThresholdMs?: number
}

export interface WaSqliteStoreResult {
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthSqliteStore
        readonly preKey: (sessionId: string) => WaPreKeySqliteStore
        readonly session: (sessionId: string) => WaSessionSqliteStore
        readonly identity: (sessionId: string) => WaIdentitySqliteStore
        readonly signal: (sessionId: string) => WaSignalSqliteStore
        readonly senderKey: (sessionId: string) => SenderKeySqliteStore
        readonly appState: (sessionId: string) => WaAppStateSqliteStore
        readonly messages: (sessionId: string) => WaMessageSqliteStore
        readonly threads: (sessionId: string) => WaThreadSqliteStore
        readonly contacts: (sessionId: string) => WaContactSqliteStore
        readonly privacyToken: (sessionId: string) => WaPrivacyTokenSqliteStore
    }
    readonly caches: {
        readonly retry: (sessionId: string) => WaRetrySqliteStore
        readonly groupMetadata: (sessionId: string) => WaGroupMetadataSqliteStore
        readonly deviceList: (sessionId: string) => WaDeviceListSqliteStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretSqliteStore
    }
}

/**
 * Builds a SQLite-backed {@link WaStoreBackend} bundle: persistent stores
 * for `auth`, `signal`, `preKey`, `session`, `identity`, `senderKey`,
 * `appState`, `messages`, `threads`, `contacts`, `privacyToken`, plus
 * TTL-evicted caches for `retry`, `groupMetadata`, `deviceList`,
 * `messageSecret`. Feed the result into `createStore({ backends: { sqlite:
 * createSqliteStore(...) }, providers: { ... } })` from `zapo-js`.
 *
 * Pass `path` for the library to open and own a connection (closed by
 * per-store `destroy()` via the shared ref-counted cache), or `connection`
 * to reuse one you already opened (you keep the lifecycle).
 *
 * @throws if neither or both of `path` / `connection` are set.
 *
 * @example
 * ```ts
 * import { createStore, WaClient } from 'zapo-js'
 * import { createSqliteStore } from '@zapo-js/store-sqlite'
 *
 * // Library-owned connection (most common)
 * const store = createStore({
 *     backends: { sqlite: createSqliteStore({ path: '.auth/state.sqlite' }) },
 *     providers: { auth: 'sqlite', signal: 'sqlite', senderKey: 'sqlite', appState: 'sqlite' }
 * })
 * const client = new WaClient({ store, sessionId: 'default' })
 * ```
 *
 * @example
 * ```ts
 * // Bring your own connection - shared with the rest of your app
 * import { createSqliteStore, openSqliteConnection } from '@zapo-js/store-sqlite'
 *
 * const connection = await openSqliteConnection({ path: 'app.sqlite', sessionId: 'shared' })
 * const store = createStore({
 *     backends: { sqlite: createSqliteStore({ connection }) },
 *     providers: { auth: 'sqlite', signal: 'sqlite', senderKey: 'sqlite', appState: 'sqlite' }
 * })
 * // ... use store + connection elsewhere ...
 * await store.destroy()
 * connection.close() // you own it
 * ```
 */
export function createSqliteStore(config: WaSqliteStoreConfig): WaSqliteStoreResult {
    if (!config.path === !config.connection) {
        throw new Error('createSqliteStore requires exactly one of "path" or "connection"')
    }
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const groupMetadataTtlMs = config.cacheTtlMs?.groupMetadataMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
    const messageSecretTtlMs = config.cacheTtlMs?.messageSecretMs
    const batchSizes = config.batchSizes
    const baseLogger = config.logger?.child({ scope: 'store', provider: 'sqlite' })
    const slowOperationThresholdMs = config.slowOperationThresholdMs

    const opts = (sessionId: string, domain: string): WaSqliteStorageOptions => ({
        sessionId,
        path: config.path,
        connection: config.connection,
        driver: config.driver,
        pragmas: config.pragmas,
        tableNames: config.tableNames,
        logger: baseLogger?.child({ domain, sessionId }),
        slowOperationThresholdMs
    })

    return {
        stores: {
            auth: (sessionId) => new WaAuthSqliteStore(opts(sessionId, 'auth')),
            preKey: (sessionId) =>
                new WaPreKeySqliteStore(opts(sessionId, 'preKey'), {
                    preKeyBatchSize: batchSizes?.signalPreKey
                }),
            session: (sessionId) =>
                new WaSessionSqliteStore(opts(sessionId, 'session'), {
                    hasSessionBatchSize: batchSizes?.signalHasSession
                }),
            identity: (sessionId) => new WaIdentitySqliteStore(opts(sessionId, 'identity')),
            signal: (sessionId) => new WaSignalSqliteStore(opts(sessionId, 'signal')),
            senderKey: (sessionId) => new SenderKeySqliteStore(opts(sessionId, 'senderKey')),
            appState: (sessionId) => new WaAppStateSqliteStore(opts(sessionId, 'appState')),
            messages: (sessionId) => new WaMessageSqliteStore(opts(sessionId, 'messages')),
            threads: (sessionId) => new WaThreadSqliteStore(opts(sessionId, 'threads')),
            contacts: (sessionId) => new WaContactSqliteStore(opts(sessionId, 'contacts')),
            privacyToken: (sessionId) =>
                new WaPrivacyTokenSqliteStore(opts(sessionId, 'privacyToken'))
        },
        caches: {
            retry: (sessionId) => new WaRetrySqliteStore(opts(sessionId, 'retry'), retryTtlMs),
            groupMetadata: (sessionId) =>
                new WaGroupMetadataSqliteStore(
                    opts(sessionId, 'groupMetadata'),
                    groupMetadataTtlMs
                ),
            deviceList: (sessionId) =>
                new WaDeviceListSqliteStore(
                    opts(sessionId, 'deviceList'),
                    deviceListTtlMs,
                    batchSizes?.deviceList
                ),
            messageSecret: (sessionId) =>
                new WaMessageSecretSqliteStore(opts(sessionId, 'messageSecret'), messageSecretTtlMs)
        }
    }
}
