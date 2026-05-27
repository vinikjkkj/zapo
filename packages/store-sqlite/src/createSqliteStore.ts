import { WaAppStateSqliteStore } from './appstate.store'
import { WaAuthSqliteStore } from './auth.store'
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
     * touched.
     */
    readonly path: string
    /**
     * SQLite driver selection. Defaults to `'auto'` which prefers
     * `better-sqlite3` on Node and falls back to `bun:sqlite` on Bun.
     * Override only when you need to pin the driver for testing.
     */
    readonly driver?: WaSqliteDriver
    /**
     * Extra `PRAGMA` statements applied right after open (e.g.
     * `journal_mode = WAL`, `synchronous = NORMAL`, custom `cache_size`).
     * Library defaults are merged with these on top.
     */
    readonly pragmas?: Readonly<Record<string, string | number>>
    /**
     * Per-domain table name overrides. Use to share a single SQLite file
     * with another application that already owns the default table names.
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
 * @example
 * ```ts
 * import { createStore, WaClient } from 'zapo-js'
 * import { createSqliteStore } from '@zapo-js/store-sqlite'
 *
 * const store = createStore({
 *     backends: { sqlite: createSqliteStore({ path: '.auth/state.sqlite' }) },
 *     providers: { auth: 'sqlite', signal: 'sqlite', senderKey: 'sqlite', appState: 'sqlite' }
 * })
 * const client = new WaClient({ store, sessionId: 'default' })
 * ```
 */
export function createSqliteStore(config: WaSqliteStoreConfig): WaSqliteStoreResult {
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const groupMetadataTtlMs = config.cacheTtlMs?.groupMetadataMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
    const messageSecretTtlMs = config.cacheTtlMs?.messageSecretMs
    const batchSizes = config.batchSizes

    const opts = (sessionId: string): WaSqliteStorageOptions => ({
        path: config.path,
        sessionId,
        driver: config.driver,
        pragmas: config.pragmas,
        tableNames: config.tableNames
    })

    return {
        stores: {
            auth: (sessionId) => new WaAuthSqliteStore(opts(sessionId)),
            preKey: (sessionId) =>
                new WaPreKeySqliteStore(opts(sessionId), {
                    preKeyBatchSize: batchSizes?.signalPreKey
                }),
            session: (sessionId) =>
                new WaSessionSqliteStore(opts(sessionId), {
                    hasSessionBatchSize: batchSizes?.signalHasSession
                }),
            identity: (sessionId) => new WaIdentitySqliteStore(opts(sessionId)),
            signal: (sessionId) => new WaSignalSqliteStore(opts(sessionId)),
            senderKey: (sessionId) =>
                new SenderKeySqliteStore(opts(sessionId), batchSizes?.senderKeyDistribution),
            appState: (sessionId) => new WaAppStateSqliteStore(opts(sessionId)),
            messages: (sessionId) => new WaMessageSqliteStore(opts(sessionId)),
            threads: (sessionId) => new WaThreadSqliteStore(opts(sessionId)),
            contacts: (sessionId) => new WaContactSqliteStore(opts(sessionId)),
            privacyToken: (sessionId) => new WaPrivacyTokenSqliteStore(opts(sessionId))
        },
        caches: {
            retry: (sessionId) => new WaRetrySqliteStore(opts(sessionId), retryTtlMs),
            groupMetadata: (sessionId) =>
                new WaGroupMetadataSqliteStore(opts(sessionId), groupMetadataTtlMs),
            deviceList: (sessionId) =>
                new WaDeviceListSqliteStore(
                    opts(sessionId),
                    deviceListTtlMs,
                    batchSizes?.deviceList
                ),
            messageSecret: (sessionId) =>
                new WaMessageSecretSqliteStore(opts(sessionId), messageSecretTtlMs)
        }
    }
}
