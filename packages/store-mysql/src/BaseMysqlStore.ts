import type { Pool, PoolConnection } from 'mysql2/promise'

import { ensureMysqlMigrations } from './connection'
import { assertSafeTablePrefix } from './helpers'
import type { WaMysqlMigrationDomain, WaMysqlStorageOptions } from './types'

export abstract class BaseMysqlStore {
    protected readonly pool: Pool
    protected readonly sessionId: string
    protected readonly tablePrefix: string
    private readonly migrationDomains: readonly WaMysqlMigrationDomain[]
    private migrationPromise: Promise<void> | null
    private migrationDone = false

    protected constructor(
        options: WaMysqlStorageOptions,
        migrationDomains: readonly WaMysqlMigrationDomain[]
    ) {
        this.pool = options.pool
        this.sessionId = options.sessionId
        this.tablePrefix = options.tablePrefix ?? ''
        assertSafeTablePrefix(this.tablePrefix)
        this.migrationDomains = migrationDomains
        this.migrationPromise = null
    }

    protected t(name: string): string {
        return `\`${this.tablePrefix}${name}\``
    }

    protected ensureReady(): Promise<void> | void {
        if (this.migrationDone) return
        if (!this.migrationPromise) {
            this.migrationPromise = ensureMysqlMigrations(
                this.pool,
                this.migrationDomains,
                this.tablePrefix
            )
                .then(() => {
                    this.migrationDone = true
                })
                .catch((err) => {
                    this.migrationPromise = null
                    throw err
                })
        }
        return this.migrationPromise
    }

    protected async withTransaction<T>(run: (conn: PoolConnection) => Promise<T>): Promise<T> {
        await this.ensureReady()
        const conn = await this.pool.getConnection()
        try {
            await conn.beginTransaction()
            const result = await run(conn)
            await conn.commit()
            return result
        } catch (err) {
            await conn.rollback()
            throw err
        } finally {
            conn.release()
        }
    }

    public async destroy(): Promise<void> {
        this.migrationPromise = null
        this.migrationDone = false
    }
}
