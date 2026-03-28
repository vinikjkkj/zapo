import { openSqliteConnection, type NonPromise, type WaSqliteConnection } from './connection'
import { ensureSqliteMigrations, type WaSqliteMigrationDomain } from './migrations'
import type { WaSqliteStorageOptions } from './types'

export abstract class BaseSqliteStore {
    protected readonly options: WaSqliteStorageOptions
    private readonly migrationDomains: readonly WaSqliteMigrationDomain[]
    private connectionPromise: Promise<WaSqliteConnection> | null

    protected constructor(
        options: WaSqliteStorageOptions,
        migrationDomains: readonly WaSqliteMigrationDomain[]
    ) {
        this.options = options
        this.migrationDomains = migrationDomains
        this.connectionPromise = null
    }

    protected async getConnection(): Promise<WaSqliteConnection> {
        if (!this.connectionPromise) {
            this.connectionPromise = openSqliteConnection(this.options).then((connection) =>
                ensureSqliteMigrations(connection, this.migrationDomains).then(() => connection)
            )
        }
        return this.connectionPromise
    }

    protected async withTransaction<T>(
        run: (connection: WaSqliteConnection) => NonPromise<T>
    ): Promise<NonPromise<T>> {
        const db = await this.getConnection()
        return db.runInTransaction(() => run(db))
    }

    public async destroy(): Promise<void> {
        const connectionPromise = this.connectionPromise
        this.connectionPromise = null
        if (!connectionPromise) {
            return
        }
        const connection = await connectionPromise
        connection.close()
    }
}
