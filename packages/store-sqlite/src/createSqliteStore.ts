import { WaAppStateSqliteStore } from './appstate.store'
import { WaAuthSqliteStore } from './auth.store'
import { WaContactSqliteStore } from './contact.store'
import { WaDeviceListSqliteStore } from './device-list.store'
import { WaIdentitySqliteStore } from './identity.store'
import { WaMessageSqliteStore } from './message.store'
import { WaParticipantsSqliteStore } from './participants.store'
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
    readonly path: string
    readonly driver?: WaSqliteDriver
    readonly pragmas?: Readonly<Record<string, string | number>>
    readonly tableNames?: WaSqliteTableNameOverrides
    readonly batchSizes?: WaSqliteBatchSizeSelection
    readonly cacheTtlMs?: {
        readonly retryMs?: number
        readonly participantsMs?: number
        readonly deviceListMs?: number
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
        readonly participants: (sessionId: string) => WaParticipantsSqliteStore
        readonly deviceList: (sessionId: string) => WaDeviceListSqliteStore
    }
}

export function createSqliteStore(config: WaSqliteStoreConfig): WaSqliteStoreResult {
    const retryTtlMs = config.cacheTtlMs?.retryMs
    const participantsTtlMs = config.cacheTtlMs?.participantsMs
    const deviceListTtlMs = config.cacheTtlMs?.deviceListMs
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
            participants: (sessionId) =>
                new WaParticipantsSqliteStore(opts(sessionId), participantsTtlMs),
            deviceList: (sessionId) =>
                new WaDeviceListSqliteStore(
                    opts(sessionId),
                    deviceListTtlMs,
                    batchSizes?.deviceList
                )
        }
    }
}
