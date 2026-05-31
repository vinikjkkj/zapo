import type { Pool, PoolClient } from 'pg'
import type { Logger } from 'zapo-js'
import { resolvePositive } from 'zapo-js/util'

import { ensurePgMigrations } from './connection'
import { assertSafeTablePrefix } from './helpers'
import type { WaPgMigrationDomain, WaPgStorageOptions } from './types'

const DEFAULT_BATCH_INSERT_CHUNK_SIZE = 500
const DEFAULT_SLOW_OPERATION_THRESHOLD_MS = 250

export abstract class BasePgStore {
    protected readonly pool: Pool
    protected readonly sessionId: string
    protected readonly tablePrefix: string
    protected readonly logger: Logger | undefined
    protected readonly slowOperationThresholdMs: number
    /**
     * Largest power-of-two sub-chunk used by multi-row INSERT helpers.
     * `batchInsertChunkSize` is rounded down to the nearest power of two
     * so each batch call only ever emits SQL with row counts from
     * `{1, 2, 4, ..., maxBatchChunk}`, bounding the named prepared
     * statements kept per pg connection.
     */
    protected readonly maxBatchChunk: number
    private readonly migrationDomains: readonly WaPgMigrationDomain[]
    private migrationPromise: Promise<void> | null

    protected constructor(
        options: WaPgStorageOptions,
        migrationDomains: readonly WaPgMigrationDomain[]
    ) {
        this.pool = options.pool
        this.sessionId = options.sessionId
        this.tablePrefix = options.tablePrefix ?? ''
        this.logger = options.logger
        this.slowOperationThresholdMs =
            options.slowOperationThresholdMs ?? DEFAULT_SLOW_OPERATION_THRESHOLD_MS
        assertSafeTablePrefix(this.tablePrefix)
        const requested = resolvePositive(
            options.batchInsertChunkSize,
            DEFAULT_BATCH_INSERT_CHUNK_SIZE,
            'batchInsertChunkSize'
        )
        this.maxBatchChunk = 1 << (31 - Math.clz32(requested))
        this.migrationDomains = migrationDomains
        this.migrationPromise = null
    }

    /**
     * Decomposes `n` into a list of power-of-two sub-chunks, each <=
     * {@link maxBatchChunk}, emitted largest-first.
     */
    protected powerOfTwoChunks(n: number): readonly number[] {
        if (n <= 0) return []
        const out: number[] = []
        let remaining = n
        let size = this.maxBatchChunk
        while (size >= 1 && remaining > 0) {
            while (remaining >= size) {
                out.push(size)
                remaining -= size
            }
            size = size >>> 1
        }
        return out
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
        if (!this.logger) {
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
        const startedAt = Date.now()
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
            const durationMs = Date.now() - startedAt
            if (durationMs >= this.slowOperationThresholdMs) {
                this.logger.warn('slow postgres transaction', {
                    operation: 'withTransaction',
                    durationMs,
                    thresholdMs: this.slowOperationThresholdMs
                })
            }
        }
    }

    public async destroy(): Promise<void> {
        this.migrationPromise = null
    }
}
