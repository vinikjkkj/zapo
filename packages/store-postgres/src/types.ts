import type { Pool, PoolConfig } from 'pg'
import type { Logger } from 'zapo-js'

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
    | 'messageSecret'

export interface WaPgStorageOptions {
    readonly pool: Pool
    readonly sessionId: string
    readonly tablePrefix?: string
    readonly batchInsertChunkSize?: number
    /**
     * Logger for slow-query warnings and migration progress. Bound
     * automatically by `createPostgresStore` with `{ scope: 'store',
     * provider: 'postgres', domain: '<name>', sessionId }`. Leave unset
     * for silent operation.
     */
    readonly logger?: Logger
    /**
     * Threshold in milliseconds above which a transaction or timed-helper
     * call emits a `warn`. Defaults to `250`.
     */
    readonly slowOperationThresholdMs?: number
}

export interface WaPgCreateStoreOptions {
    readonly pool: Pool | PoolConfig
    readonly tablePrefix?: string
    readonly batchInsertChunkSize?: number
}
