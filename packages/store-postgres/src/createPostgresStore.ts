import type { Pool, PoolConfig } from 'pg'

import { WaAppStatePgStore } from './appstate.store'
import { WaAuthPgStore } from './auth.store'
import { PgCleanupPoller } from './cleanup'
import { createPgPool } from './connection'
import { WaContactPgStore } from './contact.store'
import { WaDeviceListPgStore } from './device-list.store'
import { WaMessagePgStore } from './message.store'
import { WaParticipantsPgStore } from './participants.store'
import { WaPrivacyTokenPgStore } from './privacy-token.store'
import { WaRetryPgStore } from './retry.store'
import { WaSenderKeyPgStore } from './sender-key.store'
import { WaSignalPgStore } from './signal.store'
import { WaThreadPgStore } from './thread.store'
import type { WaPgStorageOptions } from './types'

export interface WaPgStoreConfig {
    readonly pool: Pool | PoolConfig
    readonly tablePrefix?: string
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly participantsMs?: number
        readonly deviceListMs?: number
    }
    readonly cleanup?: {
        readonly intervalMs?: number
        readonly onError?: (error: Error) => void
    }
}

export interface WaPgStoreResult {
    readonly pool: Pool
    readonly stores: {
        readonly auth: (sessionId: string) => WaAuthPgStore
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
        readonly participants: (sessionId: string) => WaParticipantsPgStore
        readonly deviceList: (sessionId: string) => WaDeviceListPgStore
    }
    startCleanup(sessionId: string): PgCleanupPoller
    destroy(): Promise<void>
}

function isPool(value: Pool | PoolConfig): value is Pool {
    return typeof (value as Pool).connect === 'function'
}

export function createPostgresStore(config: WaPgStoreConfig): WaPgStoreResult {
    const pool = isPool(config.pool) ? config.pool : createPgPool(config.pool)
    const tablePrefix = config.tablePrefix ?? ''
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const participantsTtlMs = config.cacheTtlMs?.participantsMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
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
            participants: (sessionId) =>
                new WaParticipantsPgStore(opts(sessionId), participantsTtlMs),
            deviceList: (sessionId) => new WaDeviceListPgStore(opts(sessionId), deviceListTtlMs)
        },
        startCleanup(sessionId: string): PgCleanupPoller {
            const o = opts(sessionId)
            const poller = new PgCleanupPoller({
                intervalMs: config.cleanup?.intervalMs,
                retry: new WaRetryPgStore(o, retryTtlMs),
                participants: new WaParticipantsPgStore(o, participantsTtlMs),
                deviceList: new WaDeviceListPgStore(o, deviceListTtlMs),
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
