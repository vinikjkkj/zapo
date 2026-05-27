import type { Pool, PoolConfig } from 'pg'

import { WaAppStatePgStore } from './appstate.store'
import { WaAuthPgStore } from './auth.store'
import { PgCleanupPoller } from './cleanup'
import { createPgPool } from './connection'
import { WaContactPgStore } from './contact.store'
import { WaDeviceListPgStore } from './device-list.store'
import { WaGroupMetadataPgStore } from './group-metadata.store'
import { WaIdentityPgStore } from './identity.store'
import { WaMessageSecretPgStore } from './message-secret.store'
import { WaMessagePgStore } from './message.store'
import { WaPreKeyPgStore } from './pre-key.store'
import { WaPrivacyTokenPgStore } from './privacy-token.store'
import { WaRetryPgStore } from './retry.store'
import { WaSenderKeyPgStore } from './sender-key.store'
import { WaSessionPgStore } from './session.store'
import { WaSignalPgStore } from './signal.store'
import { WaThreadPgStore } from './thread.store'
import type { WaPgStorageOptions } from './types'

export interface WaPgStoreConfig {
    /**
     * Either a live `pg` `Pool` (used as-is) or `PoolConfig` to build one.
     * When the store builds the pool itself,
     * {@link WaPgStoreResult.destroy} will `pool.end()` it. Pass an
     * externally-owned `Pool` to keep that lifecycle in your own hands.
     */
    readonly pool: Pool | PoolConfig
    /**
     * Prefix prepended to every table name. Use to share one database
     * across multiple apps without name collisions.
     */
    readonly tablePrefix?: string
    /**
     * Override default TTLs (in ms) for the cache domains. Postgres needs
     * an explicit cleanup poller (see {@link cleanup}) - rows stay in the
     * table until pruned.
     */
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly groupMetadataMs?: number
        readonly deviceListMs?: number
        readonly messageSecretMs?: number
    }
    /**
     * Background cleanup poller config. Start one poller per session via
     * {@link WaPgStoreResult.startCleanup} - without it the cache tables
     * grow monotonically.
     */
    readonly cleanup?: {
        readonly intervalMs?: number
        readonly onError?: (error: Error) => void
    }
}

export interface WaPgStoreResult {
    readonly pool: Pool
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthPgStore
        readonly preKey: (sessionId: string) => WaPreKeyPgStore
        readonly session: (sessionId: string) => WaSessionPgStore
        readonly identity: (sessionId: string) => WaIdentityPgStore
        readonly signal: (sessionId: string) => WaSignalPgStore
        readonly senderKey: (sessionId: string) => WaSenderKeyPgStore
        readonly appState: (sessionId: string) => WaAppStatePgStore
        readonly messages: (sessionId: string) => WaMessagePgStore
        readonly threads: (sessionId: string) => WaThreadPgStore
        readonly contacts: (sessionId: string) => WaContactPgStore
        readonly privacyToken: (sessionId: string) => WaPrivacyTokenPgStore
    }
    readonly caches: {
        readonly retry: (sessionId: string) => WaRetryPgStore
        readonly groupMetadata: (sessionId: string) => WaGroupMetadataPgStore
        readonly deviceList: (sessionId: string) => WaDeviceListPgStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretPgStore
    }
    startCleanup(sessionId: string): PgCleanupPoller
    destroy(): Promise<void>
}

function isPool(value: Pool | PoolConfig): value is Pool {
    return typeof (value as Pool).connect === 'function'
}

/**
 * Builds a PostgreSQL-backed {@link WaStoreBackend} bundle. Best fit for
 * stacks already on Postgres - session state rides the same backups,
 * replication and IAM as your application data.
 *
 * Cache domains require a {@link PgCleanupPoller} (`startCleanup()`) to
 * prune expired rows - call it once per session id.
 *
 * @example
 * ```ts
 * import { createStore, WaClient } from 'zapo-js'
 * import { createPostgresStore } from '@zapo-js/store-postgres'
 *
 * const result = createPostgresStore({
 *     pool: { connectionString: process.env.DATABASE_URL }
 * })
 * const store = createStore({
 *     backends: { pg: result },
 *     providers: { auth: 'pg', signal: 'pg', senderKey: 'pg', appState: 'pg' }
 * })
 * const client = new WaClient({ store, sessionId: 'default' })
 * result.startCleanup('default')
 * ```
 */
export function createPostgresStore(config: WaPgStoreConfig): WaPgStoreResult {
    const pool = isPool(config.pool) ? config.pool : createPgPool(config.pool)
    const tablePrefix = config.tablePrefix ?? ''
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const groupMetadataTtlMs = config.cacheTtlMs?.groupMetadataMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
    const messageSecretTtlMs = config.cacheTtlMs?.messageSecretMs
    const ownsPool = !isPool(config.pool)

    const opts = (sessionId: string): WaPgStorageOptions => ({
        pool,
        sessionId,
        tablePrefix
    })

    const cleanupPollers = new Set<PgCleanupPoller>()

    return {
        pool,
        stores: {
            auth: (sessionId) => new WaAuthPgStore(opts(sessionId)),
            preKey: (sessionId) => new WaPreKeyPgStore(opts(sessionId)),
            session: (sessionId) => new WaSessionPgStore(opts(sessionId)),
            identity: (sessionId) => new WaIdentityPgStore(opts(sessionId)),
            signal: (sessionId) => new WaSignalPgStore(opts(sessionId)),
            senderKey: (sessionId) => new WaSenderKeyPgStore(opts(sessionId)),
            appState: (sessionId) => new WaAppStatePgStore(opts(sessionId)),
            messages: (sessionId) => new WaMessagePgStore(opts(sessionId)),
            threads: (sessionId) => new WaThreadPgStore(opts(sessionId)),
            contacts: (sessionId) => new WaContactPgStore(opts(sessionId)),
            privacyToken: (sessionId) => new WaPrivacyTokenPgStore(opts(sessionId))
        },
        caches: {
            retry: (sessionId) => new WaRetryPgStore(opts(sessionId), retryTtlMs),
            groupMetadata: (sessionId) =>
                new WaGroupMetadataPgStore(opts(sessionId), groupMetadataTtlMs),
            deviceList: (sessionId) => new WaDeviceListPgStore(opts(sessionId), deviceListTtlMs),
            messageSecret: (sessionId) =>
                new WaMessageSecretPgStore(opts(sessionId), messageSecretTtlMs)
        },
        startCleanup(sessionId: string): PgCleanupPoller {
            const o = opts(sessionId)
            const poller = new PgCleanupPoller({
                intervalMs: config.cleanup?.intervalMs,
                retry: new WaRetryPgStore(o, retryTtlMs),
                groupMetadata: new WaGroupMetadataPgStore(o, groupMetadataTtlMs),
                deviceList: new WaDeviceListPgStore(o, deviceListTtlMs),
                messageSecret: new WaMessageSecretPgStore(o, messageSecretTtlMs),
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
