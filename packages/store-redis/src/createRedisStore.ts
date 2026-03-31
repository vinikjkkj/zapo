import Redis from 'ioredis'
import type { RedisOptions } from 'ioredis'

import { WaAppStateRedisStore } from './appstate.store'
import { WaAuthRedisStore } from './auth.store'
import { WaContactRedisStore } from './contact.store'
import { WaDeviceListRedisStore } from './device-list.store'
import { WaIdentityRedisStore } from './identity.store'
import { WaMessageSecretRedisStore } from './message-secret.store'
import { WaMessageRedisStore } from './message.store'
import { WaParticipantsRedisStore } from './participants.store'
import { WaPreKeyRedisStore } from './pre-key.store'
import { WaPrivacyTokenRedisStore } from './privacy-token.store'
import { WaRetryRedisStore } from './retry.store'
import { WaSenderKeyRedisStore } from './sender-key.store'
import { WaSessionRedisStore } from './session.store'
import { WaSignalRedisStore } from './signal.store'
import { WaThreadRedisStore } from './thread.store'
import type { WaRedisStorageOptions } from './types'

export interface WaRedisStoreConfig {
    readonly redis: Redis | RedisOptions
    readonly keyPrefix?: string
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly participantsMs?: number
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
        readonly participants: (sessionId: string) => WaParticipantsRedisStore
        readonly deviceList: (sessionId: string) => WaDeviceListRedisStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretRedisStore
    }
    destroy(): Promise<void>
}

function isRedis(value: Redis | RedisOptions): value is Redis {
    return typeof (value as Redis).get === 'function'
}

export function createRedisStore(config: WaRedisStoreConfig): WaRedisStoreResult {
    const redis = isRedis(config.redis) ? config.redis : new Redis(config.redis)
    const keyPrefix = config.keyPrefix ?? ''
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const participantsTtlMs = config.cacheTtlMs?.participantsMs
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
            participants: (sessionId) =>
                new WaParticipantsRedisStore(opts(sessionId), participantsTtlMs),
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
