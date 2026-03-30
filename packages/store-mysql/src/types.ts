import type { Pool, PoolOptions } from 'mysql2/promise'

export type MysqlParam = string | number | bigint | Uint8Array | boolean | null

export type WaMysqlMigrationDomain =
    | 'auth'
    | 'signal'
    | 'senderKey'
    | 'appState'
    | 'retry'
    | 'mailbox'
    | 'participants'
    | 'deviceList'
    | 'privacyToken'
    | 'messageSecret'

export interface WaMysqlStorageOptions {
    readonly pool: Pool
    readonly sessionId: string
    readonly tablePrefix?: string
}

export interface WaMysqlCreateStoreOptions {
    readonly pool: Pool | PoolOptions
    readonly tablePrefix?: string
}
