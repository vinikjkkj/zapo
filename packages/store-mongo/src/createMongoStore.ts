import { MongoClient } from 'mongodb'
import type { Db, MongoClientOptions } from 'mongodb'

import { WaAppStateMongoStore } from './appstate.store'
import { WaAuthMongoStore } from './auth.store'
import { WaContactMongoStore } from './contact.store'
import { WaDeviceListMongoStore } from './device-list.store'
import { WaIdentityMongoStore } from './identity.store'
import { WaMessageSecretMongoStore } from './message-secret.store'
import { WaMessageMongoStore } from './message.store'
import { WaParticipantsMongoStore } from './participants.store'
import { WaPreKeyMongoStore } from './pre-key.store'
import { WaPrivacyTokenMongoStore } from './privacy-token.store'
import { WaRetryMongoStore } from './retry.store'
import { WaSenderKeyMongoStore } from './sender-key.store'
import { WaSessionMongoStore } from './session.store'
import { WaSignalMongoStore } from './signal.store'
import { WaThreadMongoStore } from './thread.store'
import type { WaMongoStorageOptions } from './types'

export interface WaMongoStoreConfig {
    readonly db:
        | Db
        | {
              readonly uri: string
              readonly database: string
              readonly options?: MongoClientOptions
          }
    readonly collectionPrefix?: string
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly participantsMs?: number
        readonly deviceListMs?: number
        readonly messageSecretMs?: number
    }
}

export interface WaMongoStoreResult {
    readonly db: Db
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthMongoStore
        readonly preKey: (sessionId: string) => WaPreKeyMongoStore
        readonly session: (sessionId: string) => WaSessionMongoStore
        readonly identity: (sessionId: string) => WaIdentityMongoStore
        readonly signal: (sessionId: string) => WaSignalMongoStore
        readonly senderKey: (sessionId: string) => WaSenderKeyMongoStore
        readonly appState: (sessionId: string) => WaAppStateMongoStore
        readonly messages: (sessionId: string) => WaMessageMongoStore
        readonly threads: (sessionId: string) => WaThreadMongoStore
        readonly contacts: (sessionId: string) => WaContactMongoStore
        readonly privacyToken: (sessionId: string) => WaPrivacyTokenMongoStore
    }
    readonly caches: {
        readonly retry: (sessionId: string) => WaRetryMongoStore
        readonly participants: (sessionId: string) => WaParticipantsMongoStore
        readonly deviceList: (sessionId: string) => WaDeviceListMongoStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretMongoStore
    }
    destroy(): Promise<void>
}

function isDb(value: WaMongoStoreConfig['db']): value is Db {
    return typeof (value as Db).collection === 'function'
}

export function createMongoStore(config: WaMongoStoreConfig): WaMongoStoreResult {
    let db: Db
    let client: MongoClient | null = null

    if (isDb(config.db)) {
        db = config.db
    } else {
        client = new MongoClient(config.db.uri, config.db.options)
        db = client.db(config.db.database)
    }

    const collectionPrefix = config.collectionPrefix ?? ''
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const participantsTtlMs = config.cacheTtlMs?.participantsMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
    const messageSecretTtlMs = config.cacheTtlMs?.messageSecretMs

    const opts = (sessionId: string): WaMongoStorageOptions => ({
        db,
        sessionId,
        collectionPrefix
    })

    return {
        db,
        stores: {
            auth: (sessionId) => new WaAuthMongoStore(opts(sessionId)),
            preKey: (sessionId) => new WaPreKeyMongoStore(opts(sessionId)),
            session: (sessionId) => new WaSessionMongoStore(opts(sessionId)),
            identity: (sessionId) => new WaIdentityMongoStore(opts(sessionId)),
            signal: (sessionId) => new WaSignalMongoStore(opts(sessionId)),
            senderKey: (sessionId) => new WaSenderKeyMongoStore(opts(sessionId)),
            appState: (sessionId) => new WaAppStateMongoStore(opts(sessionId)),
            messages: (sessionId) => new WaMessageMongoStore(opts(sessionId)),
            threads: (sessionId) => new WaThreadMongoStore(opts(sessionId)),
            contacts: (sessionId) => new WaContactMongoStore(opts(sessionId)),
            privacyToken: (sessionId) => new WaPrivacyTokenMongoStore(opts(sessionId))
        },
        caches: {
            retry: (sessionId) => new WaRetryMongoStore(opts(sessionId), retryTtlMs),
            participants: (sessionId) =>
                new WaParticipantsMongoStore(opts(sessionId), participantsTtlMs),
            deviceList: (sessionId) => new WaDeviceListMongoStore(opts(sessionId), deviceListTtlMs),
            messageSecret: (sessionId) =>
                new WaMessageSecretMongoStore(opts(sessionId), messageSecretTtlMs)
        },
        async destroy(): Promise<void> {
            if (client) {
                await client.close()
            }
        }
    }
}
