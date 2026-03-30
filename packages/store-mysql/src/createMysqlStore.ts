import type { Pool, PoolOptions } from 'mysql2/promise'

import { WaAppStateMysqlStore } from './appstate.store'
import { WaAuthMysqlStore } from './auth.store'
import { MysqlCleanupPoller } from './cleanup'
import { createMysqlPool } from './connection'
import { WaContactMysqlStore } from './contact.store'
import { WaDeviceListMysqlStore } from './device-list.store'
import { WaIdentityMysqlStore } from './identity.store'
import { WaMessageSecretMysqlStore } from './message-secret.store'
import { WaMessageMysqlStore } from './message.store'
import { WaParticipantsMysqlStore } from './participants.store'
import { WaPreKeyMysqlStore } from './pre-key.store'
import { WaPrivacyTokenMysqlStore } from './privacy-token.store'
import { WaRetryMysqlStore } from './retry.store'
import { WaSenderKeyMysqlStore } from './sender-key.store'
import { WaSessionMysqlStore } from './session.store'
import { WaSignalMysqlStore } from './signal.store'
import { WaThreadMysqlStore } from './thread.store'
import type { WaMysqlStorageOptions } from './types'

export interface WaMysqlStoreConfig {
    readonly pool: Pool | PoolOptions
    readonly tablePrefix?: string
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly participantsMs?: number
        readonly deviceListMs?: number
        readonly messageSecretMs?: number
    }
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
        readonly participants: (sessionId: string) => WaParticipantsMysqlStore
        readonly deviceList: (sessionId: string) => WaDeviceListMysqlStore
        readonly messageSecret: (sessionId: string) => WaMessageSecretMysqlStore
    }
    startCleanup(sessionId: string): MysqlCleanupPoller
    destroy(): Promise<void>
}

function isPool(value: Pool | PoolOptions): value is Pool {
    return typeof (value as Pool).execute === 'function'
}

export function createMysqlStore(config: WaMysqlStoreConfig): WaMysqlStoreResult {
    const pool = isPool(config.pool) ? config.pool : createMysqlPool(config.pool)
    const tablePrefix = config.tablePrefix ?? ''
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const participantsTtlMs = config.cacheTtlMs?.participantsMs
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
            participants: (sessionId) =>
                new WaParticipantsMysqlStore(opts(sessionId), participantsTtlMs),
            deviceList: (sessionId) => new WaDeviceListMysqlStore(opts(sessionId), deviceListTtlMs),
            messageSecret: (sessionId) =>
                new WaMessageSecretMysqlStore(opts(sessionId), messageSecretTtlMs)
        },
        startCleanup(sessionId: string): MysqlCleanupPoller {
            const o = opts(sessionId)
            const poller = new MysqlCleanupPoller({
                intervalMs: config.cleanup?.intervalMs,
                retry: new WaRetryMysqlStore(o, retryTtlMs),
                participants: new WaParticipantsMysqlStore(o, participantsTtlMs),
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
