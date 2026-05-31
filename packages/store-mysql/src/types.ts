import type { Pool, PoolOptions } from 'mysql2/promise'
import type { Logger } from 'zapo-js'

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
    readonly batchInsertChunkSize?: number
    /**
     * Logger for slow-query warnings and migration progress. Bound
     * automatically by `createMysqlStore` with `{ scope: 'store',
     * provider: 'mysql', domain: '<name>', sessionId }`.
     */
    readonly logger?: Logger
    /**
     * Threshold in milliseconds above which a transaction or timed-helper
     * call emits a `warn`. Defaults to `250`.
     */
    readonly slowOperationThresholdMs?: number
}

export interface WaMysqlCreateStoreOptions {
    readonly pool: Pool | PoolOptions
    readonly tablePrefix?: string
    readonly batchInsertChunkSize?: number
}
