import {
    createSqliteTableNameSqlResolver,
    resolveSqliteTableNames,
    serializeSqliteTableNames
} from '@store/providers/sqlite/table-names'
import type { WaSqliteDriver, WaSqliteStorageOptions } from '@store/types'
import { toSafeNumber } from '@util/primitives'
import { isBunRuntime } from '@util/runtime'

type SqliteStatementLike = {
    readonly run: (...args: unknown[]) => unknown
    readonly get: (...args: unknown[]) => unknown
    readonly all: (...args: unknown[]) => unknown
}

type SqliteDatabaseLike = {
    readonly exec: (sql: string) => unknown
    readonly close: () => unknown
    readonly pragma?: (pragma: string) => unknown
    readonly prepare?: (sql: string) => SqliteStatementLike
    readonly query?: (sql: string) => SqliteStatementLike
}

export type NonPromise<T> = T extends PromiseLike<unknown> ? never : T
type SqliteTransactionTask<T> = () => NonPromise<T>
type NormalizedSqlitePragmas = Readonly<Record<string, string>>

interface SqliteConnectionCacheEntry {
    connection: WaSqliteConnection | null
    connectionPromise: Promise<WaSqliteConnection>
    refs: number
}

export interface WaSqliteConnection {
    readonly driver: Exclude<WaSqliteDriver, 'auto'>
    exec(sql: string): void
    run(sql: string, params?: readonly unknown[]): void
    get<T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): T | null
    all<T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): readonly T[]
    runInTransaction<T>(run: SqliteTransactionTask<T>): Promise<NonPromise<T>>
    close(): void
}

const BETTER_SQLITE3_MODULE = 'better-sqlite3'
const BUN_SQLITE_MODULE = 'bun:sqlite'
const SQLITE_PRAGMA_TOKEN_PATTERN = /^[A-Za-z0-9_+-]+$/
const DEFAULT_SQLITE_PRAGMAS: Readonly<Record<string, string | number>> = Object.freeze({
    journal_mode: 'WAL',
    synchronous: 'normal',
    busy_timeout: 5000
})

const ALLOWED_SQLITE_PRAGMAS: Readonly<Record<string, 'int' | 'token' | 'token_or_int'>> = {
    auto_vacuum: 'token_or_int',
    busy_timeout: 'int',
    cache_size: 'int',
    foreign_keys: 'token_or_int',
    journal_mode: 'token',
    journal_size_limit: 'int',
    legacy_alter_table: 'token_or_int',
    locking_mode: 'token',
    mmap_size: 'int',
    page_size: 'int',
    recursive_triggers: 'token_or_int',
    secure_delete: 'token_or_int',
    synchronous: 'token_or_int',
    temp_store: 'token_or_int',
    wal_autocheckpoint: 'int'
}

function asConstructor(loaded: unknown): new (path: string) => SqliteDatabaseLike {
    if (typeof loaded === 'function') {
        return loaded as new (path: string) => SqliteDatabaseLike
    }
    if (loaded && typeof loaded === 'object') {
        const candidate = (loaded as { default?: unknown }).default
        if (typeof candidate === 'function') {
            return candidate as new (path: string) => SqliteDatabaseLike
        }
    }
    throw new Error('invalid sqlite driver export')
}

function statementFor(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
    const prepare = db.prepare ?? db.query
    if (!prepare) {
        throw new Error('sqlite driver does not expose prepare/query method')
    }
    const statement = prepare.call(db, sql)
    if (
        !statement ||
        typeof statement.run !== 'function' ||
        typeof statement.get !== 'function' ||
        typeof statement.all !== 'function'
    ) {
        throw new Error('invalid sqlite statement API')
    }
    return statement
}

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
    return (
        !!value &&
        (typeof value === 'object' || typeof value === 'function') &&
        typeof (value as { readonly then?: unknown }).then === 'function'
    )
}

function rollbackSafely(db: SqliteDatabaseLike): void {
    try {
        db.exec('ROLLBACK')
    } catch {
        return
    }
}

function wrapConnection(
    db: SqliteDatabaseLike,
    driver: Exclude<WaSqliteDriver, 'auto'>,
    resolveSql: (sql: string) => string
): WaSqliteConnection {
    const statementCache = new Map<string, SqliteStatementLike>()
    let closed = false
    let transactionTail: Promise<void> = Promise.resolve()
    const ensureOpen = (): void => {
        if (closed) {
            throw new Error('sqlite connection is closed')
        }
    }
    const cachedStatementFor = (sql: string): SqliteStatementLike => {
        ensureOpen()
        const resolvedSql = resolveSql(sql)
        const cached = statementCache.get(resolvedSql)
        if (cached) {
            return cached
        }
        const statement = statementFor(db, resolvedSql)
        statementCache.set(resolvedSql, statement)
        return statement
    }

    return {
        driver,
        exec(sql) {
            ensureOpen()
            db.exec(resolveSql(sql))
        },
        run(sql, params) {
            const statement = cachedStatementFor(sql)
            if (!params || params.length === 0) {
                statement.run()
                return
            }
            statement.run(...params)
        },
        get<T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): T | null {
            const statement = cachedStatementFor(sql)
            const row = !params || params.length === 0 ? statement.get() : statement.get(...params)
            return (row as T | undefined) ?? null
        },
        all<T extends Record<string, unknown>>(
            sql: string,
            params?: readonly unknown[]
        ): readonly T[] {
            const statement = cachedStatementFor(sql)
            const rows = !params || params.length === 0 ? statement.all() : statement.all(...params)
            return Array.isArray(rows) ? (rows as readonly T[]) : []
        },
        runInTransaction<T>(run: SqliteTransactionTask<T>): Promise<NonPromise<T>> {
            ensureOpen()
            const previous = transactionTail
            let release: (() => void) | null = null
            transactionTail = new Promise<void>((resolve) => {
                release = resolve
            })
            const queued = previous.then(() => {
                ensureOpen()
                try {
                    db.exec('BEGIN')
                    let result: NonPromise<T> | PromiseLike<NonPromise<T>>
                    try {
                        result = run()
                    } catch (error) {
                        rollbackSafely(db)
                        throw error
                    }
                    if (isPromiseLike<NonPromise<T>>(result)) {
                        rollbackSafely(db)
                        throw new Error('sqlite transaction callback must be synchronous')
                    }
                    db.exec('COMMIT')
                    return result
                } catch (error) {
                    rollbackSafely(db)
                    throw error
                }
            })
            return queued.finally(() => {
                release?.()
            })
        },
        close() {
            if (closed) {
                return
            }
            closed = true
            statementCache.clear()
            db.close()
        }
    }
}

function mergePragmas(
    pragmas: WaSqliteStorageOptions['pragmas']
): Readonly<Record<string, string | number>> {
    return {
        ...DEFAULT_SQLITE_PRAGMAS,
        ...(pragmas ?? {})
    }
}

const ALLOWED_SQLITE_PRAGMA_LIST = Object.keys(ALLOWED_SQLITE_PRAGMAS).sort().join(', ')

function normalizePragmaKey(rawKey: string): string {
    const key = rawKey.trim().toLowerCase()
    if (!Object.prototype.hasOwnProperty.call(ALLOWED_SQLITE_PRAGMAS, key)) {
        throw new Error(
            `unsupported sqlite pragma "${rawKey}". Allowed pragmas: ${ALLOWED_SQLITE_PRAGMA_LIST}`
        )
    }
    return key
}

function normalizePragmaToken(key: string, rawValue: string): string {
    const value = rawValue.trim()
    if (value.length === 0 || !SQLITE_PRAGMA_TOKEN_PATTERN.test(value)) {
        throw new Error(
            `invalid sqlite pragma "${key}" value "${rawValue}". Allowed token pattern: ${SQLITE_PRAGMA_TOKEN_PATTERN}`
        )
    }
    return value
}

function normalizePragmaValue(key: string, rawValue: string | number): string {
    const kind = ALLOWED_SQLITE_PRAGMAS[key]
    if (kind === 'int') {
        if (typeof rawValue !== 'number') {
            throw new Error(`sqlite pragma "${key}" must be a number`)
        }
        return String(toSafeNumber(rawValue, `sqlite pragma "${key}"`))
    }

    if (kind === 'token') {
        if (typeof rawValue !== 'string') {
            throw new Error(`sqlite pragma "${key}" must be a string token`)
        }
        return normalizePragmaToken(key, rawValue)
    }

    if (typeof rawValue === 'number') {
        return String(toSafeNumber(rawValue, `sqlite pragma "${key}"`))
    }

    return normalizePragmaToken(key, rawValue)
}

function normalizePragmas(pragmas: WaSqliteStorageOptions['pragmas']): NormalizedSqlitePragmas {
    const normalized: Record<string, string> = {}
    for (const [rawKey, rawValue] of Object.entries(mergePragmas(pragmas))) {
        const key = normalizePragmaKey(rawKey)
        normalized[key] = normalizePragmaValue(key, rawValue)
    }
    return normalized
}

function applyPragmas(db: SqliteDatabaseLike, pragmas: NormalizedSqlitePragmas): void {
    for (const [key, value] of Object.entries(pragmas)) {
        const statement = `${key}=${value}`
        if (db.pragma) {
            db.pragma(statement)
            continue
        }
        db.exec(`PRAGMA ${statement}`)
    }
}

function closeDatabaseSafely(db: SqliteDatabaseLike): void {
    try {
        db.close()
    } catch {
        return
    }
}

async function openBetterSqlite(
    options: WaSqliteStorageOptions,
    resolveSql: (sql: string) => string,
    pragmas: NormalizedSqlitePragmas
): Promise<WaSqliteConnection> {
    let loaded: unknown
    try {
        loaded = await import(BETTER_SQLITE3_MODULE)
    } catch {
        throw new Error(
            'optional dependency "better-sqlite3" is not installed. Install with: npm i better-sqlite3'
        )
    }

    const Database = asConstructor(loaded)
    const db = new Database(options.path)
    try {
        applyPragmas(db, pragmas)
    } catch (error) {
        closeDatabaseSafely(db)
        throw error
    }

    return wrapConnection(db, 'better-sqlite3', resolveSql)
}

async function openBunSqlite(
    options: WaSqliteStorageOptions,
    resolveSql: (sql: string) => string,
    pragmas: NormalizedSqlitePragmas
): Promise<WaSqliteConnection> {
    let loaded: unknown
    try {
        loaded = await import(BUN_SQLITE_MODULE)
    } catch {
        throw new Error(
            'bun runtime sqlite module "bun:sqlite" is unavailable. Run this in Bun or set storage.sqlite.driver to "better-sqlite3".'
        )
    }

    if (!loaded || typeof loaded !== 'object') {
        throw new Error('invalid bun sqlite module export')
    }
    const ctor = (loaded as { Database?: unknown }).Database
    if (typeof ctor !== 'function') {
        throw new Error('invalid bun sqlite module export')
    }

    const db = new (ctor as new (path: string) => SqliteDatabaseLike)(options.path)
    try {
        applyPragmas(db, pragmas)
    } catch (error) {
        closeDatabaseSafely(db)
        throw error
    }

    return wrapConnection(db, 'bun', resolveSql)
}

function resolveDriver(requested: WaSqliteDriver | undefined): WaSqliteDriver {
    if (requested && requested !== 'auto') {
        return requested
    }
    return isBunRuntime() ? 'bun' : 'better-sqlite3'
}

function requireConnection(entry: SqliteConnectionCacheEntry): WaSqliteConnection {
    const connection = entry.connection
    if (!connection) {
        throw new Error('sqlite connection is not open')
    }
    return connection
}

function createConnectionHandle(
    entry: SqliteConnectionCacheEntry,
    cacheKey: string
): WaSqliteConnection {
    let closed = false
    const ensureOpen = (): void => {
        if (closed) {
            throw new Error('sqlite connection handle is closed')
        }
    }
    return {
        driver: requireConnection(entry).driver,
        exec(sql) {
            ensureOpen()
            requireConnection(entry).exec(sql)
        },
        run(sql, params) {
            ensureOpen()
            requireConnection(entry).run(sql, params)
        },
        get<T extends Record<string, unknown>>(sql: string, params?: readonly unknown[]): T | null {
            ensureOpen()
            return requireConnection(entry).get<T>(sql, params)
        },
        all<T extends Record<string, unknown>>(
            sql: string,
            params?: readonly unknown[]
        ): readonly T[] {
            ensureOpen()
            return requireConnection(entry).all<T>(sql, params)
        },
        runInTransaction<T>(run: SqliteTransactionTask<T>): Promise<NonPromise<T>> {
            ensureOpen()
            return requireConnection(entry).runInTransaction(run)
        },
        close() {
            if (closed) {
                return
            }
            closed = true
            if (entry.refs <= 0) {
                return
            }
            entry.refs -= 1
            if (entry.refs > 0) {
                return
            }
            if (SQLITE_CONNECTION_CACHE.get(cacheKey) === entry) {
                SQLITE_CONNECTION_CACHE.delete(cacheKey)
            }
            const connection = entry.connection
            entry.connection = null
            connection?.close()
        }
    }
}

export async function openSqliteConnection(
    options: WaSqliteStorageOptions
): Promise<WaSqliteConnection> {
    const driver = resolveDriver(options.driver)
    const resolvedTableNames = resolveSqliteTableNames(options.tableNames)
    const resolveSql = createSqliteTableNameSqlResolver(resolvedTableNames)
    const normalizedPragmas = normalizePragmas(options.pragmas)
    const normalizedOptions: WaSqliteStorageOptions = {
        ...options,
        driver,
        pragmas: normalizedPragmas,
        tableNames: resolvedTableNames
    }
    const cacheKey = `${driver}|${options.path}|${Object.entries(normalizedPragmas)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(';')}|${serializeSqliteTableNames(resolvedTableNames)}`
    let entry = SQLITE_CONNECTION_CACHE.get(cacheKey)
    if (!entry) {
        const createdConnection =
            driver === 'bun'
                ? openBunSqlite(normalizedOptions, resolveSql, normalizedPragmas)
                : openBetterSqlite(normalizedOptions, resolveSql, normalizedPragmas)
        const createdEntry: SqliteConnectionCacheEntry = {
            connection: null,
            connectionPromise: Promise.resolve(null as never),
            refs: 0
        }
        createdEntry.connectionPromise = createdConnection
            .then((connection) => {
                createdEntry.connection = connection
                return connection
            })
            .catch((error) => {
                if (SQLITE_CONNECTION_CACHE.get(cacheKey) === createdEntry) {
                    SQLITE_CONNECTION_CACHE.delete(cacheKey)
                }
                throw error
            })
        SQLITE_CONNECTION_CACHE.set(cacheKey, createdEntry)
        entry = createdEntry
    }
    if (!entry) {
        throw new Error('sqlite connection cache entry was not initialized')
    }
    entry.refs += 1
    try {
        await entry.connectionPromise
    } catch (error) {
        entry.refs = Math.max(0, entry.refs - 1)
        if (entry.refs === 0 && SQLITE_CONNECTION_CACHE.get(cacheKey) === entry) {
            SQLITE_CONNECTION_CACHE.delete(cacheKey)
        }
        throw error
    }
    return createConnectionHandle(entry, cacheKey)
}

const SQLITE_CONNECTION_CACHE = new Map<string, SqliteConnectionCacheEntry>()
