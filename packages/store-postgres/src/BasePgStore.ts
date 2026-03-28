import type { Pool, PoolClient } from 'pg'

import { ensurePgMigrations } from './connection'
import { assertSafeTablePrefix } from './helpers'
import type { WaPgMigrationDomain, WaPgStorageOptions } from './types'

export abstract class BasePgStore {
    protected readonly pool: Pool
    protected readonly sessionId: string
    protected readonly tablePrefix: string
    private readonly migrationDomains: readonly WaPgMigrationDomain[]
    private migrationPromise: Promise<void> | null

    protected constructor(
        options: WaPgStorageOptions,
        migrationDomains: readonly WaPgMigrationDomain[]
    ) {
        this.pool = options.pool
        this.sessionId = options.sessionId
        this.tablePrefix = options.tablePrefix ?? ''
        assertSafeTablePrefix(this.tablePrefix)
        this.migrationDomains = migrationDomains
        this.migrationPromise = null
    }

    protected t(name: string): string {
        return `"${this.tablePrefix}${name}"`
    }

    protected stmtName(key: string): string {
        return `${this.tablePrefix}${key}`
    }

    protected async ensureReady(): Promise<void> {
        if (!this.migrationPromise) {
            this.migrationPromise = ensurePgMigrations(
                this.pool,
                this.migrationDomains,
                this.tablePrefix
            ).catch((err) => {
                this.migrationPromise = null
                throw err
            })
        }
        return this.migrationPromise
    }

    protected async withTransaction<T>(run: (client: PoolClient) => Promise<T>): Promise<T> {
        await this.ensureReady()
        const client = await this.pool.connect()
        try {
            await client.query('BEGIN')
            const result = await run(client)
            await client.query('COMMIT')
            return result
        } catch (err) {
            await client.query('ROLLBACK')
            throw err
        } finally {
            client.release()
        }
    }

    public async destroy(): Promise<void> {
        this.migrationPromise = null
    }
}
