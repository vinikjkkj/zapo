import type { Pool, PoolConfig } from 'pg'

export type PgParam = string | number | bigint | Uint8Array | boolean | null

export type WaPgMigrationDomain =
    | 'auth'
    | 'signal'
    | 'senderKey'
    | 'appState'
    | 'retry'
    | 'mailbox'
    | 'participants'
    | 'deviceList'
    | 'privacyToken'

export interface WaPgStorageOptions {
    readonly pool: Pool
    readonly sessionId: string
    readonly tablePrefix?: string
}

export interface WaPgCreateStoreOptions {
    readonly pool: Pool | PoolConfig
    readonly tablePrefix?: string
}
