import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createStore } from '@store/createStore'
import { openSqliteConnection } from '@store/providers/sqlite/connection'

test('createStore validates sqlite requirements and session lifecycle', async () => {
    assert.throws(() => createStore({}).session('default'), /sqlite.path must be configured/)

    const dir = await mkdtemp(join(tmpdir(), 'zapo-store-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const store = createStore({
        sqlite: {
            path: sqlitePath,
            driver: 'better-sqlite3'
        },
        providers: {
            messages: 'memory',
            threads: 'memory',
            contacts: 'memory'
        },
        cacheProviders: {
            retry: 'memory',
            participants: 'memory',
            deviceList: 'memory'
        }
    })

    try {
        const session1 = store.session(' default ')
        const session2 = store.session('default')
        assert.strictEqual(session1, session2)
        assert.throws(() => store.session('   '), /sessionId must be a non-empty string/)

        await session1.messages.upsert({
            id: 'm1',
            threadJid: 'thread-1',
            fromMe: true
        })
        assert.ok(await session1.messages.getById('m1'))
        await session1.privacyToken.upsert({
            jid: '5511@s.whatsapp.net',
            tcToken: new Uint8Array([1, 2]),
            updatedAtMs: Date.now()
        })
        assert.ok(await session1.privacyToken.getByJid('5511@s.whatsapp.net'))

        await store.destroyCaches()
        await store.destroy()
        assert.throws(() => store.session('x'), /store has been destroyed/)
    } finally {
        await rm(dir, { recursive: true, force: true })
    }
})

test('createStore validates custom providers resolution', () => {
    const store = createStore({
        sqlite: {
            path: 'ignored.sqlite',
            driver: 'better-sqlite3'
        },
        custom: {
            auth: () => null as never
        }
    })

    assert.throws(() => store.session('x'), /custom.auth must resolve to a store instance/)
})

test('createStore forwards sqlite.tableNames to sqlite providers', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'zapo-store-custom-tables-'))
    const sqlitePath = join(dir, 'state.sqlite')
    const tableNames = Object.freeze({
        wa_migrations: 'store_custom_migrations',
        auth_credentials: 'store_custom_auth_credentials'
    } as const)
    const store = createStore({
        sqlite: {
            path: sqlitePath,
            driver: 'better-sqlite3',
            tableNames
        },
        providers: {
            signal: 'memory',
            senderKey: 'memory',
            appState: 'memory',
            messages: 'none',
            threads: 'none',
            contacts: 'none'
        },
        cacheProviders: {
            retry: 'memory',
            participants: 'none',
            deviceList: 'none'
        }
    })

    try {
        const session = store.session('default')
        assert.equal(await session.auth.load(), null)

        const db = await openSqliteConnection({
            path: sqlitePath,
            sessionId: 'default',
            driver: 'better-sqlite3',
            tableNames
        })
        try {
            const customAuth = db.get<{ readonly name: string }>(
                `SELECT name
                 FROM sqlite_master
                 WHERE type = 'table' AND name = ?`,
                ['store_custom_auth_credentials']
            )
            const defaultAuth = db.get<{ readonly name: string }>(
                `SELECT name
                 FROM sqlite_master
                 WHERE type = 'table' AND name = ?`,
                ['auth_credentials']
            )
            assert.equal(customAuth?.name, 'store_custom_auth_credentials')
            assert.equal(defaultAuth, null)
        } finally {
            db.close()
        }
    } finally {
        await store.destroy()
        await rm(dir, { recursive: true, force: true })
    }
})
