import type { Logger } from 'zapo-js'

import { type NonPromise, openSqliteConnection, type WaSqliteConnection } from './connection'
import { ensureSqliteMigrations, type WaSqliteMigrationDomain } from './migrations'
import type { WaSqliteStorageOptions } from './types'

const DEFAULT_SLOW_OPERATION_THRESHOLD_MS = 250

export abstract class BaseSqliteStore {
    protected readonly options: WaSqliteStorageOptions
    protected readonly logger: Logger | undefined
    protected readonly slowOperationThresholdMs: number
    private readonly migrationDomains: readonly WaSqliteMigrationDomain[]
    private connectionPromise: Promise<WaSqliteConnection> | null

    protected constructor(
        options: WaSqliteStorageOptions,
        migrationDomains: readonly WaSqliteMigrationDomain[]
    ) {
        this.options = options
        this.logger = options.logger
        this.slowOperationThresholdMs =
            options.slowOperationThresholdMs ?? DEFAULT_SLOW_OPERATION_THRESHOLD_MS
        this.migrationDomains = migrationDomains
        this.connectionPromise = null
    }

    protected async getConnection(): Promise<WaSqliteConnection> {
        if (!this.connectionPromise) {
            const supplied = this.options.connection
            const path = this.options.path
            if (supplied && path) {
                throw new Error('sqlite store accepts only one of "path" or "connection"')
            }
            if (!supplied && !path) {
                throw new Error('sqlite store requires either "path" or "connection"')
            }
            const open: Promise<WaSqliteConnection> = supplied
                ? Promise.resolve(supplied)
                : openSqliteConnection(this.options, this.logger)
            this.connectionPromise = open.then((connection) =>
                ensureSqliteMigrations(connection, this.migrationDomains, this.logger).then(
                    () => connection
                )
            )
        }
        return this.connectionPromise
    }

    protected async withTransaction<T>(
        run: (connection: WaSqliteConnection) => NonPromise<T>
    ): Promise<NonPromise<T>> {
        const db = await this.getConnection()
        if (!this.logger) {
            return db.runInTransaction(() => run(db))
        }
        const startedAt = Date.now()
        try {
            return await db.runInTransaction(() => run(db))
        } finally {
            const durationMs = Date.now() - startedAt
            if (durationMs >= this.slowOperationThresholdMs) {
                this.logger.warn('slow sqlite transaction', {
                    operation: 'withTransaction',
                    durationMs,
                    thresholdMs: this.slowOperationThresholdMs
                })
            }
        }
    }

    public async destroy(): Promise<void> {
        const connectionPromise = this.connectionPromise
        this.connectionPromise = null
        if (!connectionPromise) {
            return
        }
        if (this.options.connection) {
            return
        }
        const connection = await connectionPromise
        connection.close()
    }
}
