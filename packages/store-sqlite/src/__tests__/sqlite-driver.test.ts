import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import type { SignalAddress } from 'zapo-js/signal'
import { isBunRuntime } from 'zapo-js/util'

import { openSqliteConnection } from '../connection'
import { WaIdentitySqliteStore } from '../identity.store'
import { WaPreKeySqliteStore } from '../pre-key.store'
import type { WaSqliteDriver } from '../types'

/**
 * Both backends are optional here, so every case guards the ones it pins.
 *
 * `better-sqlite3` is an optional peer dependency. `node:sqlite` only exists
 * from Node 22.13 (22.5 behind `--experimental-sqlite`) and Bun 1.4, while the
 * package supports Node 20.9+ - so on an older runtime the module is simply
 * absent and the node-driver cases have nothing to exercise.
 *
 * The probe opens a real database rather than importing the module, because
 * importing is not enough to tell the two apart: under Bun the
 * `better-sqlite3` entry point resolves fine and only blows up later, when the
 * addon is dlopened. Answering "can this driver open a database here?" is the
 * question the tests actually need.
 */
const driverProbes = new Map<WaSqliteDriver, Promise<boolean>>()

function canOpenWith(driver: Exclude<WaSqliteDriver, 'auto'>): Promise<boolean> {
    let probe = driverProbes.get(driver)
    if (!probe) {
        probe = openSqliteConnection({ path: ':memory:', sessionId: 'driver-probe', driver }).then(
            (connection) => {
                connection.close()
                return true
            },
            () => false
        )
        driverProbes.set(driver, probe)
    }
    return probe
}

const hasBetterSqlite3 = (): Promise<boolean> => canOpenWith('better-sqlite3')
const hasNodeSqlite = (): Promise<boolean> => canOpenWith('node')

function makeBytes(length: number, seed = 0): Uint8Array {
    const out = new Uint8Array(length)
    for (let index = 0; index < out.length; index += 1) {
        out[index] = (seed + index) & 0xff
    }
    return out
}

function makeAddress(user: string, device: number): SignalAddress {
    return { user, server: 's.whatsapp.net', device }
}

async function withTempDir<T>(prefix: string, run: (dir: string) => Promise<T>): Promise<T> {
    const dir = await mkdtemp(join(tmpdir(), prefix))
    try {
        return await run(dir)
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
}

test('node:sqlite driver opens and reports itself', async (t) => {
    if (!(await hasNodeSqlite())) {
        t.skip('node:sqlite is unavailable on this runtime')
        return
    }
    await withTempDir('zapo-sqlite-node-driver-', async (dir) => {
        const connection = await openSqliteConnection({
            path: join(dir, 'state.sqlite'),
            sessionId: 'session-node',
            driver: 'node'
        })
        try {
            assert.equal(connection.driver, 'node')
            connection.exec('CREATE TABLE probe (id INTEGER PRIMARY KEY, payload BLOB)')
            connection.run('INSERT INTO probe (id, payload) VALUES (?, ?)', [1, makeBytes(8, 3)])
            const row = connection.get<{ payload: Uint8Array }>(
                'SELECT payload FROM probe WHERE id = ?',
                [1]
            )
            assert.deepEqual(row?.payload, makeBytes(8, 3))
        } finally {
            connection.close()
        }
    })
})

test('node:sqlite driver runs migrations and round-trips store records', async (t) => {
    if (!(await hasNodeSqlite())) {
        t.skip('node:sqlite is unavailable on this runtime')
        return
    }
    await withTempDir('zapo-sqlite-node-store-', async (dir) => {
        const options = {
            path: join(dir, 'state.sqlite'),
            sessionId: 'session-node',
            driver: 'node' as WaSqliteDriver
        }
        const identityStore = new WaIdentitySqliteStore(options)
        const preKeyStore = new WaPreKeySqliteStore(options)

        try {
            const alice = makeAddress('5511900000001', 0)
            const bob = makeAddress('5511900000002', 3)
            await identityStore.setRemoteIdentities([
                { address: alice, identityKey: makeBytes(32, 1) },
                { address: bob, identityKey: makeBytes(32, 2) }
            ])

            assert.deepEqual(await identityStore.getRemoteIdentity(alice), makeBytes(32, 1))
            // Batch read goes through the multi-term OR filter, so it also
            // covers parameter binding at a larger arity.
            assert.deepEqual(await identityStore.getRemoteIdentities([bob, alice]), [
                makeBytes(32, 2),
                makeBytes(32, 1)
            ])

            await preKeyStore.putPreKey({
                keyId: 42,
                keyPair: { pubKey: makeBytes(32, 7), privKey: makeBytes(32, 8) },
                uploaded: false
            })
            const stored = await preKeyStore.getPreKeyById(42)
            assert.equal(stored?.keyId, 42)
            assert.deepEqual(stored?.keyPair.pubKey, makeBytes(32, 7))

            // Booleans are persisted as integers; verify the round-trip type.
            await preKeyStore.setServerHasPreKeys(true)
            assert.equal(await preKeyStore.getServerHasPreKeys(), true)

            const consumed = await preKeyStore.consumePreKeyById(42)
            assert.equal(consumed?.keyId, 42)
            assert.equal(await preKeyStore.getPreKeyById(42), null)
        } finally {
            await Promise.all([identityStore.destroy(), preKeyStore.destroy()])
        }
    })
})

test('databases are interchangeable between the better-sqlite3 and node drivers', async (t) => {
    if (!(await hasBetterSqlite3()) || !(await hasNodeSqlite())) {
        t.skip('the swap needs both better-sqlite3 and node:sqlite')
        return
    }
    await withTempDir('zapo-sqlite-driver-swap-', async (dir) => {
        const path = join(dir, 'state.sqlite')
        const address = makeAddress('5511900000009', 1)

        const writer = new WaIdentitySqliteStore({
            path,
            sessionId: 'session-swap',
            driver: 'better-sqlite3'
        })
        try {
            await writer.setRemoteIdentity(address, makeBytes(32, 5))
        } finally {
            await writer.destroy()
        }

        const reader = new WaIdentitySqliteStore({
            path,
            sessionId: 'session-swap',
            driver: 'node'
        })
        try {
            assert.deepEqual(await reader.getRemoteIdentity(address), makeBytes(32, 5))
            // Writing back through the other driver keeps the same schema, so
            // no migration re-runs and the row is simply replaced.
            await reader.setRemoteIdentity(address, makeBytes(32, 6))
            assert.deepEqual(await reader.getRemoteIdentity(address), makeBytes(32, 6))
        } finally {
            await reader.destroy()
        }

        const verifier = new WaIdentitySqliteStore({
            path,
            sessionId: 'session-swap',
            driver: 'better-sqlite3'
        })
        try {
            assert.deepEqual(await verifier.getRemoteIdentity(address), makeBytes(32, 6))
        } finally {
            await verifier.destroy()
        }
    })
})

test('auto driver prefers better-sqlite3 when the addon is installed', async (t) => {
    if (isBunRuntime()) {
        t.skip('auto resolves to bun:sqlite under Bun, before any addon lookup')
        return
    }
    if (!(await hasBetterSqlite3())) {
        t.skip('better-sqlite3 is not installed')
        return
    }
    await withTempDir('zapo-sqlite-auto-driver-', async (dir) => {
        const connection = await openSqliteConnection({
            path: join(dir, 'state.sqlite'),
            sessionId: 'session-auto',
            driver: 'auto'
        })
        try {
            assert.equal(connection.driver, 'better-sqlite3')
        } finally {
            connection.close()
        }
    })
})

/**
 * Complement of the case above: exactly one of the two runs in any given
 * environment. CI drops the addon for one job so this branch - the whole
 * reason the node driver exists - is actually executed somewhere.
 */
test('auto driver falls back to node:sqlite when the addon is absent', async (t) => {
    if (isBunRuntime()) {
        t.skip('auto resolves to bun:sqlite under Bun, before any addon lookup')
        return
    }
    if (await hasBetterSqlite3()) {
        t.skip('better-sqlite3 is installed, so the fallback cannot be observed')
        return
    }
    if (!(await hasNodeSqlite())) {
        t.skip('node:sqlite is unavailable on this runtime')
        return
    }
    await withTempDir('zapo-sqlite-auto-fallback-', async (dir) => {
        const connection = await openSqliteConnection({
            path: join(dir, 'state.sqlite'),
            sessionId: 'session-auto-fallback',
            driver: 'auto'
        })
        try {
            assert.equal(connection.driver, 'node')
        } finally {
            connection.close()
        }
    })
})
