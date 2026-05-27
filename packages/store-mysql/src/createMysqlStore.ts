import type { Pool, PoolOptions } from 'mysql2/promise'

import { WaAppStateMysqlStore } from './appstate.store'
import { WaAuthMysqlStore } from './auth.store'
import { MysqlCleanupPoller } from './cleanup'
import { createMysqlPool } from './connection'
import { WaContactMysqlStore } from './contact.store'
import { WaDeviceListMysqlStore } from './device-list.store'
import { WaGroupMetadataMysqlStore } from './group-metadata.store'
import { WaIdentityMysqlStore } from './identity.store'
import { WaMessageSecretMysqlStore } from './message-secret.store'
import { WaMessageMysqlStore } from './message.store'
import { WaPreKeyMysqlStore } from './pre-key.store'
import { WaPrivacyTokenMysqlStore } from './privacy-token.store'
import { WaRetryMysqlStore } from './retry.store'
import { WaSenderKeyMysqlStore } from './sender-key.store'
import { WaSessionMysqlStore } from './session.store'
import { WaSignalMysqlStore } from './signal.store'
import { WaThreadMysqlStore } from './thread.store'
import type { WaMysqlStorageOptions } from './types'

export interface WaMysqlStoreConfig {
    /**
     * Either a live `mysql2/promise` `Pool` (used as-is) or `PoolOptions`
     * to build one. When the store builds the pool itself,
     * {@link WaMysqlStoreResult.destroy} will `pool.end()` it. Pass an
     * externally-owned `Pool` to keep that lifecycle in your own hands.
     */
    readonly pool: Pool | PoolOptions
    /**
     * Prefix prepended to every table name. Use to share one database
     * across multiple apps without name collisions.
     */
    readonly tablePrefix?: string
    /**
     * Override default TTLs (in ms) for the cache domains. Unlike SQLite
     * (lazy on-read eviction) and Redis/Mongo (server-side TTL), MySQL
     * needs an explicit cleanup poller - see {@link cleanup}.
     */
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly groupMetadataMs?: number
        readonly deviceListMs?: number
        readonly messageSecretMs?: number
    }
    /**
     * Background cleanup poller config. Without this, expired cache rows
     * stay in the table until overwritten - the cache tables grow
     * monotonically. Start one poller per session via
     * {@link WaMysqlStoreResult.startCleanup}.
     */
    readonly cleanup?: {
        readonly enabled?: boolean
        readonly intervalMs?: number
        readonly onError?: (error: Error) => void
    }
}

export interface WaMysqlStoreResult {
    readonly pool: Pool
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthMysqlStore
        readonly preKey: (sessionId: string) => WaPreKeyMysqlStore
        readonly session: (sessionId: string) => WaSessionMysqlStore
        readonly identity: (sessionId: string) => WaIdentityMysqlStore
        readonly signal: (sessionId: string) => WaSignalMysqlStore
        readonly senderKey: (sessionId: string) => WaSenderKeyMysqlStore
        readonly appState: (sessionId: string) => WaAppStateMysqlStore
        readonly messages: (sessionId: string) => WaMessageMysqlStore
        readonly threads: (sessionId: string) => WaThreadMysqlStore
        readonly contacts: (sessionId: string) => WaContactMysqlStore
        readonly privacyToken: (sessionId: string) => WaPrivacyTokenMysqlStore
    }
    readonly caches: {
        readonly retry: (sessionId: string) => WaRetryMysqlStore
        readonly groupMetadata: (sessionId: string) => WaGroupMetadataMysqlStore
        readonly deviceList: (sessionId: string) => WaDeviceListMysqlStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretMysqlStore
    }
    startCleanup(sessionId: string): MysqlCleanupPoller
    destroy(): Promise<void>
}

function isPool(value: Pool | PoolOptions): value is Pool {
    return typeof (value as Pool).execute === 'function'
}

/**
 * Builds a MySQL / MariaDB-backed {@link WaStoreBackend} bundle. Good fit
 * for fleets standardized on MySQL where you want session state to ride
 * the same backups / replication / IAM.
 *
 * Cache domains require a {@link MysqlCleanupPoller} (`startCleanup()`)
 * to prune expired rows - call it once per session id.
 *
 * @example
 * ```ts
 * import { createStore, WaClient } from 'zapo-js'
 * import { createMysqlStore } from '@zapo-js/store-mysql'
 *
 * const result = createMysqlStore({
 *     pool: { host: 'localhost', user: 'wa', password: 'wa', database: 'wa' }
 * })
 * const store = createStore({
 *     backends: { mysql: result },
 *     providers: { auth: 'mysql', signal: 'mysql', senderKey: 'mysql', appState: 'mysql' }
 * })
 * const client = new WaClient({ store, sessionId: 'default' })
 * result.startCleanup('default')
 * ```
 */
export function createMysqlStore(config: WaMysqlStoreConfig): WaMysqlStoreResult {
    const pool = isPool(config.pool) ? config.pool : createMysqlPool(config.pool)
    const tablePrefix = config.tablePrefix ?? ''
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const groupMetadataTtlMs = config.cacheTtlMs?.groupMetadataMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
    const messageSecretTtlMs = config.cacheTtlMs?.messageSecretMs
    const ownsPool = !isPool(config.pool)

    const opts = (sessionId: string): WaMysqlStorageOptions => ({
        pool,
        sessionId,
        tablePrefix
    })

    const cleanupPollers = new Set<MysqlCleanupPoller>()

    return {
        pool,
        stores: {
            auth: (sessionId) => new WaAuthMysqlStore(opts(sessionId)),
            preKey: (sessionId) => new WaPreKeyMysqlStore(opts(sessionId)),
            session: (sessionId) => new WaSessionMysqlStore(opts(sessionId)),
            identity: (sessionId) => new WaIdentityMysqlStore(opts(sessionId)),
            signal: (sessionId) => new WaSignalMysqlStore(opts(sessionId)),
            senderKey: (sessionId) => new WaSenderKeyMysqlStore(opts(sessionId)),
            appState: (sessionId) => new WaAppStateMysqlStore(opts(sessionId)),
            messages: (sessionId) => new WaMessageMysqlStore(opts(sessionId)),
            threads: (sessionId) => new WaThreadMysqlStore(opts(sessionId)),
            contacts: (sessionId) => new WaContactMysqlStore(opts(sessionId)),
            privacyToken: (sessionId) => new WaPrivacyTokenMysqlStore(opts(sessionId))
        },
        caches: {
            retry: (sessionId) => new WaRetryMysqlStore(opts(sessionId), retryTtlMs),
            groupMetadata: (sessionId) =>
                new WaGroupMetadataMysqlStore(opts(sessionId), groupMetadataTtlMs),
            deviceList: (sessionId) => new WaDeviceListMysqlStore(opts(sessionId), deviceListTtlMs),
            messageSecret: (sessionId) =>
                new WaMessageSecretMysqlStore(opts(sessionId), messageSecretTtlMs)
        },
        startCleanup(sessionId: string): MysqlCleanupPoller {
            const o = opts(sessionId)
            const poller = new MysqlCleanupPoller({
                intervalMs: config.cleanup?.intervalMs,
                retry: new WaRetryMysqlStore(o, retryTtlMs),
                groupMetadata: new WaGroupMetadataMysqlStore(o, groupMetadataTtlMs),
                deviceList: new WaDeviceListMysqlStore(o, deviceListTtlMs),
                messageSecret: new WaMessageSecretMysqlStore(o, messageSecretTtlMs),
                onError: config.cleanup?.onError
            })
            poller.start()
            cleanupPollers.add(poller)
            return poller
        },
        async destroy(): Promise<void> {
            for (const poller of cleanupPollers) {
                poller.stop()
            }
            cleanupPollers.clear()
            if (ownsPool) {
                await pool.end()
            }
        }
    }
}
