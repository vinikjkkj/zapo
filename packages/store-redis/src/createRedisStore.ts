import Redis, { type RedisOptions } from 'ioredis'
import type { Logger } from 'zapo-js'

import { WaAppStateRedisStore } from './appstate.store'
import { WaAuthRedisStore } from './auth.store'
import { WaContactRedisStore } from './contact.store'
import { WaDeviceListRedisStore } from './device-list.store'
import { WaGroupMetadataRedisStore } from './group-metadata.store'
import { WaIdentityRedisStore } from './identity.store'
import { WaMessageSecretRedisStore } from './message-secret.store'
import { WaMessageRedisStore } from './message.store'
import { WaPreKeyRedisStore } from './pre-key.store'
import { WaPrivacyTokenRedisStore } from './privacy-token.store'
import { WaRetryRedisStore } from './retry.store'
import { WaSenderKeyRedisStore } from './sender-key.store'
import { WaSessionRedisStore } from './session.store'
import { WaSignalRedisStore } from './signal.store'
import { WaThreadRedisStore } from './thread.store'
import type { WaRedisStorageOptions } from './types'

export interface WaRedisStoreConfig {
    /**
     * Either a live `ioredis` `Redis` instance (used as-is) or `RedisOptions`
     * to construct a new client. When `createRedisStore` builds the client
     * itself it also owns its lifecycle - {@link WaRedisStoreResult.destroy}
     * calls `redis.quit()`. Pass an externally-owned `Redis` to keep that
     * lifecycle in your own hands.
     */
    readonly redis: Redis | RedisOptions
    /**
     * Prefix prepended to every Redis key. Use to share one Redis instance
     * across multiple unrelated apps (`'wa:'`, `'tenant-A:'`, ...).
     */
    readonly keyPrefix?: string
    /**
     * Override default TTLs (in ms) for the cache domains. Implemented as
     * Redis `EX`/`PEXPIRE` on each write, so expired entries are pruned by
     * Redis itself - no background cleanup needed.
     */
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly groupMetadataMs?: number
        readonly deviceListMs?: number
        readonly messageSecretMs?: number
    }
    /**
     * Logger for connection lifecycle and degraded paths emitted by the
     * factory (connect/ready/reconnecting/end/error). The factory binds
     * `{ scope: 'store', provider: 'redis' }` and each per-domain store
     * binds its own `{ domain: '<name>' }`. When unset, the Redis layer
     * stays silent.
     */
    readonly logger?: Logger
}

export interface WaRedisStoreResult {
    readonly redis: Redis
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthRedisStore
        readonly preKey: (sessionId: string) => WaPreKeyRedisStore
        readonly session: (sessionId: string) => WaSessionRedisStore
        readonly identity: (sessionId: string) => WaIdentityRedisStore
        readonly signal: (sessionId: string) => WaSignalRedisStore
        readonly senderKey: (sessionId: string) => WaSenderKeyRedisStore
        readonly appState: (sessionId: string) => WaAppStateRedisStore
        readonly messages: (sessionId: string) => WaMessageRedisStore
        readonly threads: (sessionId: string) => WaThreadRedisStore
        readonly contacts: (sessionId: string) => WaContactRedisStore
        readonly privacyToken: (sessionId: string) => WaPrivacyTokenRedisStore
    }
    readonly caches: {
        readonly retry: (sessionId: string) => WaRetryRedisStore
        readonly groupMetadata: (sessionId: string) => WaGroupMetadataRedisStore
        readonly deviceList: (sessionId: string) => WaDeviceListRedisStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretRedisStore
    }
    destroy(): Promise<void>
}

function isRedis(value: Redis | RedisOptions): value is Redis {
    return typeof (value as Redis).get === 'function'
}

/**
 * Builds a Redis-backed {@link WaStoreBackend} bundle. Best fit when you
 * already run Redis for caching and want stateless app instances that can
 * share session state - all 11 persistent domains and 4 cache domains live
 * under a single key namespace (controlled by `keyPrefix`).
 *
 * Cache domains use native Redis TTLs (`EX`/`PEXPIRE` on write); no
 * background cleanup job is needed.
 *
 * @example
 * ```ts
 * import { createStore, WaClient } from 'zapo-js'
 * import { createRedisStore } from '@zapo-js/store-redis'
 *
 * const store = createStore({
 *     backends: {
 *         redis: createRedisStore({
 *             redis: { host: '127.0.0.1', port: 6379 },
 *             keyPrefix: 'wa:'
 *         })
 *     },
 *     providers: { auth: 'redis', signal: 'redis', senderKey: 'redis', appState: 'redis' }
 * })
 * const client = new WaClient({ store, sessionId: 'default' })
 * ```
 */
export function createRedisStore(config: WaRedisStoreConfig): WaRedisStoreResult {
    const redis = isRedis(config.redis) ? config.redis : new Redis(config.redis)
    const keyPrefix = config.keyPrefix ?? ''
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const groupMetadataTtlMs = config.cacheTtlMs?.groupMetadataMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
    const messageSecretTtlMs = config.cacheTtlMs?.messageSecretMs
    const ownsRedis = !isRedis(config.redis)
    const baseLogger = config.logger?.child({ scope: 'store', provider: 'redis' })

    if (baseLogger && ownsRedis) {
        // Only attach lifecycle listeners on connections we own; externally
        // supplied clients keep their existing event surface untouched.
        redis.on('connect', () =>
            baseLogger.info('redis connected', { keyPrefix: keyPrefix || undefined })
        )
        redis.on('ready', () => baseLogger.debug('redis ready'))
        redis.on('reconnecting', (delayMs: number) =>
            baseLogger.warn('redis reconnecting', { delayMs })
        )
        // 'end' also fires on the redis.quit() path during graceful destroy(),
        // so this stays at debug to avoid spurious warns on intentional teardown.
        redis.on('end', () => baseLogger.debug('redis connection ended'))
        redis.on('error', (err: Error) => baseLogger.warn('redis error', { message: err.message }))
    }

    const opts = (sessionId: string, domain: string): WaRedisStorageOptions => ({
        redis,
        sessionId,
        keyPrefix,
        logger: baseLogger?.child({ domain, sessionId })
    })

    return {
        redis,
        stores: {
            auth: (sessionId) => new WaAuthRedisStore(opts(sessionId, 'auth')),
            preKey: (sessionId) => new WaPreKeyRedisStore(opts(sessionId, 'preKey')),
            session: (sessionId) => new WaSessionRedisStore(opts(sessionId, 'session')),
            identity: (sessionId) => new WaIdentityRedisStore(opts(sessionId, 'identity')),
            signal: (sessionId) => new WaSignalRedisStore(opts(sessionId, 'signal')),
            senderKey: (sessionId) => new WaSenderKeyRedisStore(opts(sessionId, 'senderKey')),
            appState: (sessionId) => new WaAppStateRedisStore(opts(sessionId, 'appState')),
            messages: (sessionId) => new WaMessageRedisStore(opts(sessionId, 'messages')),
            threads: (sessionId) => new WaThreadRedisStore(opts(sessionId, 'threads')),
            contacts: (sessionId) => new WaContactRedisStore(opts(sessionId, 'contacts')),
            privacyToken: (sessionId) =>
                new WaPrivacyTokenRedisStore(opts(sessionId, 'privacyToken'))
        },
        caches: {
            retry: (sessionId) => new WaRetryRedisStore(opts(sessionId, 'retry'), retryTtlMs),
            groupMetadata: (sessionId) =>
                new WaGroupMetadataRedisStore(opts(sessionId, 'groupMetadata'), groupMetadataTtlMs),
            deviceList: (sessionId) =>
                new WaDeviceListRedisStore(opts(sessionId, 'deviceList'), deviceListTtlMs),
            messageSecret: (sessionId) =>
                new WaMessageSecretRedisStore(opts(sessionId, 'messageSecret'), messageSecretTtlMs)
        },
        async destroy(): Promise<void> {
            if (ownsRedis) {
                await redis.quit()
            }
        }
    }
}
