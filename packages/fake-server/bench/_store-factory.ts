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

import { unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join as joinPath } from 'node:path'

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
    const userPath = process.env.ZAPO_BENCH_SQLITE_PATH
    const ownsFile = !userPath
    const path = userPath ?? joinPath(tmpdir(), `zapo-bench-${process.pid}-${Date.now()}.sqlite`)
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
            if (ownsFile && path !== ':memory:') {
                for (const suffix of ['', '-wal', '-shm']) {
                    await unlink(path + suffix).catch(() => undefined)
                }
            }
        }
    }
}

async function buildPostgresStore(): Promise<BenchStoreFixture> {
    const { createPostgresStore } = await import('@zapo-js/store-postgres')
    const pg = await import('pg')
    const host = requireEnv('ZAPO_TEST_PG_HOST')
    const port = parsePort('ZAPO_TEST_PG_PORT')
    const user = process.env.ZAPO_TEST_PG_USER ?? 'postgres'
    const password = process.env.ZAPO_TEST_PG_PASSWORD ?? 'test'
    const database = process.env.ZAPO_TEST_PG_DATABASE ?? 'zapo_test'
    const tablePrefix = uniquePrefix('pg')

    const rawPool = new pg.Pool({ host, port, user, password, database, max: 16 })
    const trace = process.env.ZAPO_BENCH_TRACE_QUERIES === '1'
    const queryStats = new Map<string, { count: number; totalUs: number }>()
    const sqlKey = (sql: string): string => {
        const compact = sql.replace(/\s+/g, ' ').trim()
        const m = compact.match(
            /^(SELECT [^F]*FROM \S+|INSERT INTO \S+|UPDATE \S+|DELETE FROM \S+|BEGIN|COMMIT|ROLLBACK)/i
        )
        return m ? m[1] : compact.slice(0, 60)
    }
    const recordCall = (sql: string, start: bigint): void => {
        const elapsedUs = Number(process.hrtime.bigint() - start) / 1000
        const key = sqlKey(sql)
        const cur = queryStats.get(key) ?? { count: 0, totalUs: 0 }
        cur.count += 1
        cur.totalUs += elapsedUs
        queryStats.set(key, cur)
    }
    // Only wrap Pool.connect: pg-pool's Pool.query() routes through connect
    // + client.query, so a single connect hook traces both direct pool.query
    // and explicit withTransaction client.query without double-counting.
    const WRAPPED = Symbol('trace.query.wrapped')
    const wrapClient = (client: object): void => {
        if ((client as Record<symbol, unknown>)[WRAPPED]) return
        ;(client as Record<symbol, unknown>)[WRAPPED] = true
        const c = client as { query: Function }
        const originalQuery = c.query.bind(c)
        c.query = function (...args: unknown[]) {
            const start = process.hrtime.bigint()
            const arg0 = args[0] as string | { text?: string }
            const sql = typeof arg0 === 'string' ? arg0 : (arg0?.text ?? '<unknown>')
            const result = originalQuery(...args) as unknown
            if (result && typeof (result as { then?: unknown }).then === 'function') {
                return (result as Promise<unknown>).finally(() => recordCall(sql, start))
            }
            recordCall(sql, start)
            return result
        }
    }
    const pool = !trace
        ? rawPool
        : new Proxy(rawPool, {
              get(target, prop, receiver) {
                  if (prop !== 'connect') return Reflect.get(target, prop, receiver)
                  return function (cb?: unknown) {
                      if (typeof cb === 'function') {
                          return (target.connect as Function).call(
                              target,
                              (err: unknown, client: unknown, done: unknown) => {
                                  if (client) wrapClient(client)
                                  cb(err, client, done)
                              }
                          )
                      }
                      return (target.connect as Function).call(target).then((client: unknown) => {
                          wrapClient(client as object)
                          return client
                      })
                  }
              }
          })

    const backend = createPostgresStore({
        pool,
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
            if (trace) {
                const sorted = [...queryStats.entries()].sort((a, b) => b[1].totalUs - a[1].totalUs)
                console.log('\n[pg query stats]')
                let totalCount = 0
                let totalUs = 0
                for (const [sql, s] of sorted) {
                    totalCount += s.count
                    totalUs += s.totalUs
                    console.log(
                        '  ' +
                            String(s.count).padStart(6) +
                            '  ' +
                            (s.totalUs / 1000).toFixed(1).padStart(9) +
                            ' ms  ' +
                            sql
                    )
                }
                console.log(
                    `  ${String(totalCount).padStart(6)}  ${(totalUs / 1000).toFixed(1).padStart(9)} ms  TOTAL`
                )
            }
            await rawPool.end().catch(() => undefined)
        }
    }
}

async function buildMysqlStore(): Promise<BenchStoreFixture> {
    const { createMysqlStore } = await import('@zapo-js/store-mysql')
    const mysql = await import('mysql2/promise')
    const host = requireEnv('ZAPO_TEST_MYSQL_HOST')
    const port = parsePort('ZAPO_TEST_MYSQL_PORT')
    const user = process.env.ZAPO_TEST_MYSQL_USER ?? 'root'
    const password = process.env.ZAPO_TEST_MYSQL_PASSWORD ?? 'test'
    const database = process.env.ZAPO_TEST_MYSQL_DATABASE ?? 'zapo_test'
    const tablePrefix = uniquePrefix('mysql')

    const rawPool = mysql.createPool({
        host,
        port,
        user,
        password,
        database,
        connectionLimit: 16
    })
    const trace = process.env.ZAPO_BENCH_TRACE_QUERIES === '1'
    const queryStats = new Map<string, { count: number; totalUs: number }>()
    const sqlKey = (sql: string): string => {
        const compact = sql.replace(/\s+/g, ' ').trim()
        const m = compact.match(
            /^(SELECT [^F]*FROM \S+|INSERT INTO \S+|INSERT IGNORE INTO \S+|UPDATE \S+|DELETE FROM \S+|BEGIN|COMMIT|ROLLBACK)/i
        )
        return m ? m[1] : compact.slice(0, 60)
    }
    const recordCall = (sql: string, start: bigint): void => {
        const elapsedUs = Number(process.hrtime.bigint() - start) / 1000
        const key = sqlKey(sql)
        const cur = queryStats.get(key) ?? { count: 0, totalUs: 0 }
        cur.count += 1
        cur.totalUs += elapsedUs
        queryStats.set(key, cur)
    }
    const pool = !trace
        ? rawPool
        : new Proxy(rawPool, {
              get(target, prop, receiver) {
                  if (prop === 'execute' || prop === 'query') {
                      return async (sql: string, params?: unknown) => {
                          const start = process.hrtime.bigint()
                          try {
                              return await (target as unknown as Record<string, Function>)[
                                  prop as string
                              ].call(target, sql, params)
                          } finally {
                              recordCall(sql, start)
                          }
                      }
                  }
                  if (prop === 'getConnection') {
                      return async () => {
                          const conn = await target.getConnection()
                          return new Proxy(conn, {
                              get(connTarget, connProp, connReceiver) {
                                  if (connProp === 'execute' || connProp === 'query') {
                                      return async (sql: string, params?: unknown) => {
                                          const start = process.hrtime.bigint()
                                          try {
                                              return await (
                                                  connTarget as unknown as Record<string, Function>
                                              )[connProp as string].call(connTarget, sql, params)
                                          } finally {
                                              recordCall(sql, start)
                                          }
                                      }
                                  }
                                  return Reflect.get(connTarget, connProp, connReceiver)
                              }
                          })
                      }
                  }
                  return Reflect.get(target, prop, receiver)
              }
          })

    const backend = createMysqlStore({
        pool,
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
            if (trace) {
                const sorted = [...queryStats.entries()].sort((a, b) => b[1].totalUs - a[1].totalUs)
                console.log('\n[mysql query stats]')
                let totalCount = 0
                let totalUs = 0
                for (const [sql, s] of sorted) {
                    totalCount += s.count
                    totalUs += s.totalUs
                    console.log(
                        '  ' +
                            String(s.count).padStart(6) +
                            '  ' +
                            (s.totalUs / 1000).toFixed(1).padStart(9) +
                            ' ms  ' +
                            sql
                    )
                }
                console.log(
                    `  ${String(totalCount).padStart(6)}  ${(totalUs / 1000).toFixed(1).padStart(9)} ms  TOTAL`
                )
            }
            await rawPool.end().catch(() => undefined)
        }
    }
}

async function buildRedisStore(): Promise<BenchStoreFixture> {
    const { createRedisStore } = await import('@zapo-js/store-redis')
    const { Redis } = await import('ioredis')
    const host = requireEnv('ZAPO_TEST_REDIS_HOST')
    const port = parsePort('ZAPO_TEST_REDIS_PORT')
    const keyPrefix = uniquePrefix('redis')

    const rawClient = new Redis({ host, port, lazyConnect: false })
    const trace = process.env.ZAPO_BENCH_TRACE_QUERIES === '1'
    const callStats = new Map<string, { count: number; totalUs: number }>()
    const recordCall = (cmd: string, start: bigint): void => {
        const elapsedUs = Number(process.hrtime.bigint() - start) / 1000
        const cur = callStats.get(cmd) ?? { count: 0, totalUs: 0 }
        cur.count += 1
        cur.totalUs += elapsedUs
        callStats.set(cmd, cur)
    }
    if (trace) {
        // ioredis dispatches every redis command through internal `sendCommand`.
        // Wrap it so both direct method calls (set/get/hget/...) and pipelined
        // commands get accounted, regardless of which API the store reaches for.
        const orig = (
            rawClient as unknown as { sendCommand: (cmd: { name: string }) => Promise<unknown> }
        ).sendCommand.bind(rawClient)
        ;(
            rawClient as unknown as { sendCommand: (cmd: { name: string }) => Promise<unknown> }
        ).sendCommand = (cmd) => {
            const start = process.hrtime.bigint()
            const out = orig(cmd)
            return out.finally(() => recordCall(cmd.name, start))
        }
    }

    const backend = createRedisStore({
        redis: rawClient,
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
            if (trace) {
                const sorted = [...callStats.entries()].sort((a, b) => b[1].totalUs - a[1].totalUs)
                console.log('\n[redis cmd stats]')
                let totalCount = 0
                let totalUs = 0
                for (const [cmd, s] of sorted) {
                    totalCount += s.count
                    totalUs += s.totalUs
                    console.log(
                        '  ' +
                            String(s.count).padStart(6) +
                            '  ' +
                            (s.totalUs / 1000).toFixed(1).padStart(9) +
                            ' ms  ' +
                            cmd
                    )
                }
                console.log(
                    `  ${String(totalCount).padStart(6)}  ${(totalUs / 1000).toFixed(1).padStart(9)} ms  TOTAL`
                )
            }
            await rawClient.quit().catch(() => undefined)
        }
    }
}

async function buildMongoStore(): Promise<BenchStoreFixture> {
    const { createMongoStore } = await import('@zapo-js/store-mongo')
    const { MongoClient } = await import('mongodb')
    const host = requireEnv('ZAPO_TEST_MONGO_HOST')
    const port = parsePort('ZAPO_TEST_MONGO_PORT')
    const uri = `mongodb://${host}:${port}/?directConnection=true`
    const database = `zapo_bench_${Date.now().toString(36)}`

    const trace = process.env.ZAPO_BENCH_TRACE_QUERIES === '1'
    const cmdStats = new Map<string, { count: number; totalUs: number }>()
    const rawClient = new MongoClient(uri, { monitorCommands: trace })
    if (trace) {
        const startedAt = new Map<number, { start: bigint; key: string }>()
        rawClient.on('commandStarted', (event) => {
            // mongo command bodies put the collection at `cmd[cmdName]` for
            // crud commands (update/insert/find/delete) and as `getMore`'s
            // `collection` field. Use that to attribute per-collection cost.
            const cmd = event.command as Record<string, unknown>
            const candidate = cmd[event.commandName] ?? cmd.collection
            const coll = typeof candidate === 'string' ? candidate : undefined
            const key = coll ? `${event.commandName} ${coll}` : event.commandName
            startedAt.set(event.requestId, { start: process.hrtime.bigint(), key })
        })
        const finish = (event: { requestId: number }): void => {
            const meta = startedAt.get(event.requestId)
            startedAt.delete(event.requestId)
            if (!meta) return
            const elapsedUs = Number(process.hrtime.bigint() - meta.start) / 1000
            const cur = cmdStats.get(meta.key) ?? { count: 0, totalUs: 0 }
            cur.count += 1
            cur.totalUs += elapsedUs
            cmdStats.set(meta.key, cur)
        }
        rawClient.on('commandSucceeded', finish)
        rawClient.on('commandFailed', finish)
    }
    await rawClient.connect()
    const db = rawClient.db(database)
    const backend = createMongoStore({ db })

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
            if (trace) {
                const sorted = [...cmdStats.entries()].sort((a, b) => b[1].totalUs - a[1].totalUs)
                console.log('\n[mongo cmd stats]')
                let totalCount = 0
                let totalUs = 0
                for (const [cmd, s] of sorted) {
                    totalCount += s.count
                    totalUs += s.totalUs
                    console.log(
                        '  ' +
                            String(s.count).padStart(7) +
                            '  ' +
                            (s.totalUs / 1000).toFixed(1).padStart(9) +
                            ' ms  ' +
                            cmd
                    )
                }
                console.log(
                    `  ${String(totalCount).padStart(7)}  ${(totalUs / 1000).toFixed(1).padStart(9)} ms  TOTAL`
                )
            }
            await rawClient.close().catch(() => undefined)
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
