/**
 * Pluggable store factory for the fake-server bench suite. Selects a
 * backend via `ZAPO_BENCH_STORE` (memory | sqlite | postgres | mysql |
 * redis | mongo) and wires the matching `@zapo-js/store-*` package into
 * `createStore()` from `zapo-js`.
 *
 * - `memory` (default): in-process bounded maps. No external dep.
 * - `sqlite`: file or `:memory:`. Driver via `ZAPO_BENCH_SQLITE_PATH`
 *   (default `:memory:`). Persistent domains (`auth`, `signal`, etc.)
 *   resolve to the sqlite backend; mailbox / cache domains stay in
 *   memory unless explicitly switched.
 * - `postgres` / `mysql`: needs a live server. Reads the same
 *   `ZAPO_TEST_PG_*` / `ZAPO_TEST_MYSQL_*` env vars used by
 *   `scripts/test-stores.cjs` and the per-package integration tests.
 * - `redis`: needs a live redis. Reads `ZAPO_TEST_REDIS_HOST/PORT`.
 * - `mongo`: needs a live mongo (replica set). Reads
 *   `ZAPO_TEST_MONGO_HOST/PORT`.
 *
 * The factory returns a teardown that:
 * - calls `await store.destroy()` (the WaStore handles per-domain
 *   `destroy()` of stores it created), and
 * - for backends that own a pool/client built from env vars, closes that
 *   too. When a `Pool` / `Redis` / `Db` is passed in, we don't own it.
 */

import { createStore, type WaCreateStoreOptions, type WaStore } from 'zapo-js'

type ProvidersFor<B extends string> = Required<NonNullable<WaCreateStoreOptions<B>['providers']>>

export type StoreBackendName = 'memory' | 'sqlite' | 'postgres' | 'mysql' | 'redis' | 'mongo'

const ALL_BACKENDS: ReadonlySet<StoreBackendName> = new Set([
    'memory',
    'sqlite',
    'postgres',
    'mysql',
    'redis',
    'mongo'
])

export function resolveStoreBackend(): StoreBackendName {
    const raw = process.env.ZAPO_BENCH_STORE ?? 'memory'
    if (!ALL_BACKENDS.has(raw as StoreBackendName)) {
        throw new Error(`unknown ZAPO_BENCH_STORE=${raw}; valid: ${[...ALL_BACKENDS].join(', ')}`)
    }
    return raw as StoreBackendName
}

const PERSISTENT_DOMAINS = [
    'auth',
    'signal',
    'preKey',
    'session',
    'identity',
    'senderKey',
    'appState',
    'privacyToken'
] as const

const MAILBOX_DOMAINS = ['messages', 'threads', 'contacts'] as const

const CACHE_DOMAINS = ['retry', 'groupMetadata', 'deviceList', 'messageSecret'] as const

export interface BenchStoreFixture {
    readonly backend: StoreBackendName
    readonly store: WaStore
    readonly description: string
    destroy: () => Promise<void>
}

export async function buildBenchStore(): Promise<BenchStoreFixture> {
    const backend = resolveStoreBackend()
    switch (backend) {
        case 'memory':
            return buildMemoryStore()
        case 'sqlite':
            return await buildSqliteStore()
        case 'postgres':
            return await buildPostgresStore()
        case 'mysql':
            return await buildMysqlStore()
        case 'redis':
            return await buildRedisStore()
        case 'mongo':
            return await buildMongoStore()
        default: {
            const _exhaustive: never = backend
            throw new Error(`unreachable: ${_exhaustive as string}`)
        }
    }
}

function buildProviders<B extends string>(name: B): ProvidersFor<B> {
    const out: Record<string, B> = {}
    for (const d of PERSISTENT_DOMAINS) out[d] = name
    for (const d of MAILBOX_DOMAINS) out[d] = name
    for (const d of CACHE_DOMAINS) out[d] = name
    return out as ProvidersFor<B>
}

function buildMemoryStore(): BenchStoreFixture {
    const store = createStore({
        memory: { limits: { signalPreKeys: 16_384 } }
    })
    return {
        backend: 'memory',
        store,
        description: 'in-process memory (signalPreKeys cap 16384)',
        destroy: async () => {
            await store.destroy()
        }
    }
}

async function buildSqliteStore(): Promise<BenchStoreFixture> {
    const { createSqliteStore } = await import('@zapo-js/store-sqlite')
    const path = process.env.ZAPO_BENCH_SQLITE_PATH ?? ':memory:'
    const backend = createSqliteStore({ path })
    const store = createStore({
        backends: { sqlite: backend },
        providers: buildProviders('sqlite')
    })
    return {
        backend: 'sqlite',
        store,
        description: `sqlite (path=${path})`,
        destroy: async () => {
            await store.destroy()
        }
    }
}

async function buildPostgresStore(): Promise<BenchStoreFixture> {
    const { createPostgresStore } = await import('@zapo-js/store-postgres')
    const host = requireEnv('ZAPO_TEST_PG_HOST')
    const port = parsePort('ZAPO_TEST_PG_PORT')
    const user = process.env.ZAPO_TEST_PG_USER ?? 'postgres'
    const password = process.env.ZAPO_TEST_PG_PASSWORD ?? 'test'
    const database = process.env.ZAPO_TEST_PG_DATABASE ?? 'zapo_test'
    const tablePrefix = uniquePrefix('pg')
    const backend = createPostgresStore({
        pool: { host, port, user, password, database, max: 16 },
        tablePrefix
    })
    const store = createStore({
        backends: { postgres: backend },
        providers: buildProviders('postgres')
    })
    return {
        backend: 'postgres',
        store,
        description: `postgres (${host}:${port}/${database} prefix=${tablePrefix})`,
        destroy: async () => {
            await store.destroy()
        }
    }
}

async function buildMysqlStore(): Promise<BenchStoreFixture> {
    const { createMysqlStore } = await import('@zapo-js/store-mysql')
    const host = requireEnv('ZAPO_TEST_MYSQL_HOST')
    const port = parsePort('ZAPO_TEST_MYSQL_PORT')
    const user = process.env.ZAPO_TEST_MYSQL_USER ?? 'root'
    const password = process.env.ZAPO_TEST_MYSQL_PASSWORD ?? 'test'
    const database = process.env.ZAPO_TEST_MYSQL_DATABASE ?? 'zapo_test'
    const tablePrefix = uniquePrefix('mysql')
    const backend = createMysqlStore({
        pool: { host, port, user, password, database, connectionLimit: 16 },
        tablePrefix
    })
    const store = createStore({
        backends: { mysql: backend },
        providers: buildProviders('mysql')
    })
    return {
        backend: 'mysql',
        store,
        description: `mysql (${host}:${port}/${database} prefix=${tablePrefix})`,
        destroy: async () => {
            await store.destroy()
        }
    }
}

async function buildRedisStore(): Promise<BenchStoreFixture> {
    const { createRedisStore } = await import('@zapo-js/store-redis')
    const host = requireEnv('ZAPO_TEST_REDIS_HOST')
    const port = parsePort('ZAPO_TEST_REDIS_PORT')
    const keyPrefix = uniquePrefix('redis')
    const backend = createRedisStore({
        redis: { host, port, lazyConnect: false },
        keyPrefix
    })
    const store = createStore({
        backends: { redis: backend },
        providers: buildProviders('redis')
    })
    return {
        backend: 'redis',
        store,
        description: `redis (${host}:${port} prefix=${keyPrefix})`,
        destroy: async () => {
            await store.destroy()
        }
    }
}

async function buildMongoStore(): Promise<BenchStoreFixture> {
    const { createMongoStore } = await import('@zapo-js/store-mongo')
    const host = requireEnv('ZAPO_TEST_MONGO_HOST')
    const port = parsePort('ZAPO_TEST_MONGO_PORT')
    const uri = `mongodb://${host}:${port}/?directConnection=true`
    const database = `zapo_bench_${Date.now().toString(36)}`
    const backend = createMongoStore({
        db: { uri, database }
    })
    const store = createStore({
        backends: { mongo: backend },
        providers: buildProviders('mongo')
    })
    return {
        backend: 'mongo',
        store,
        description: `mongo (${host}:${port}/${database})`,
        destroy: async () => {
            await store.destroy()
        }
    }
}

function requireEnv(name: string): string {
    const v = process.env[name]
    if (!v) {
        throw new Error(
            `env ${name} is required for ZAPO_BENCH_STORE=${process.env.ZAPO_BENCH_STORE}; ` +
                `start the docker-compose stack or use ZAPO_BENCH_STORE=memory`
        )
    }
    return v
}

function parsePort(name: string): number {
    const raw = requireEnv(name)
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`env ${name}=${raw} must be a valid TCP port`)
    }
    return parsed
}

function uniquePrefix(suffix: string): string {
    return `bench_${process.pid.toString(36)}_${Date.now().toString(36)}_${suffix}_`
}
