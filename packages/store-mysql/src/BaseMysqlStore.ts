import type { Pool, PoolConnection } from 'mysql2/promise'
import type { Logger } from 'zapo-js'
import { resolvePositive } from 'zapo-js/util'

import { ensureMysqlMigrations } from './connection'
import { assertSafeTablePrefix } from './helpers'
import type { WaMysqlMigrationDomain, WaMysqlStorageOptions } from './types'

const DEFAULT_BATCH_INSERT_CHUNK_SIZE = 500
const DEFAULT_SLOW_OPERATION_THRESHOLD_MS = 250

export abstract class BaseMysqlStore {
    protected readonly pool: Pool
    protected readonly sessionId: string
    protected readonly tablePrefix: string
    protected readonly logger: Logger | undefined
    protected readonly slowOperationThresholdMs: number
    /**
     * Largest power-of-two sub-chunk used by multi-row INSERT helpers.
     * Caller passes `batchInsertChunkSize`; we round down to the nearest
     * power of two so the set of distinct SQL texts emitted by batch
     * writes stays bounded by `log2(maxBatchChunk)`. This keeps the mysql2
     * client-side prep cache and the server-side `max_prepared_stmt_count`
     * quota bounded regardless of how the caller varies batch sizes.
     */
    protected readonly maxBatchChunk: number
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
     * {@link maxBatchChunk}, emitted largest-first. Multi-row INSERT
     * call sites iterate this list and emit one statement per
     * sub-chunk so the inner SQL text only ever takes on values from
     * `{1, 2, 4, ..., maxBatchChunk}`.
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
        if (!this.logger) {
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
        const startedAt = Date.now()
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
            const durationMs = Date.now() - startedAt
            if (durationMs >= this.slowOperationThresholdMs) {
                this.logger.warn('slow mysql transaction', {
                    operation: 'withTransaction',
                    durationMs,
                    thresholdMs: this.slowOperationThresholdMs
                })
            }
        }
    }

    public async destroy(): Promise<void> {
        this.migrationPromise = null
        this.migrationDone = false
    }
}
