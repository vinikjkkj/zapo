import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createStore } from '@store/createStore'

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

