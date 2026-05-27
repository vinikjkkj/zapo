import Redis, { type RedisOptions } from 'ioredis'

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

    const opts = (sessionId: string): WaRedisStorageOptions => ({
        redis,
        sessionId,
        keyPrefix
    })

    return {
        redis,
        stores: {
            auth: (sessionId) => new WaAuthRedisStore(opts(sessionId)),
            preKey: (sessionId) => new WaPreKeyRedisStore(opts(sessionId)),
            session: (sessionId) => new WaSessionRedisStore(opts(sessionId)),
            identity: (sessionId) => new WaIdentityRedisStore(opts(sessionId)),
            signal: (sessionId) => new WaSignalRedisStore(opts(sessionId)),
            senderKey: (sessionId) => new WaSenderKeyRedisStore(opts(sessionId)),
            appState: (sessionId) => new WaAppStateRedisStore(opts(sessionId)),
            messages: (sessionId) => new WaMessageRedisStore(opts(sessionId)),
            threads: (sessionId) => new WaThreadRedisStore(opts(sessionId)),
            contacts: (sessionId) => new WaContactRedisStore(opts(sessionId)),
            privacyToken: (sessionId) => new WaPrivacyTokenRedisStore(opts(sessionId))
        },
        caches: {
            retry: (sessionId) => new WaRetryRedisStore(opts(sessionId), retryTtlMs),
            groupMetadata: (sessionId) =>
                new WaGroupMetadataRedisStore(opts(sessionId), groupMetadataTtlMs),
            deviceList: (sessionId) => new WaDeviceListRedisStore(opts(sessionId), deviceListTtlMs),
            messageSecret: (sessionId) =>
                new WaMessageSecretRedisStore(opts(sessionId), messageSecretTtlMs)
        },
        async destroy(): Promise<void> {
            if (ownsRedis) {
                await redis.quit()
            }
        }
    }
}
