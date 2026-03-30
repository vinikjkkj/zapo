import assert from 'node:assert/strict'
import test from 'node:test'

import { createStore } from '@store/createStore'

const mockAuthBackend = {
    stores: {
        auth: () => ({
            async load() {
                return null
            },
            async save() {},
            async clear() {}
        }),
        signal: () => {
            throw new Error('not expected')
        },
        preKey: () => {
            throw new Error('not expected')
        },
        session: () => {
            throw new Error('not expected')
        },
        identity: () => {
            throw new Error('not expected')
        },
        senderKey: () => {
            throw new Error('not expected')
        },
        appState: () => {
            throw new Error('not expected')
        },
        messages: () => {
            throw new Error('not expected')
        },
        threads: () => {
            throw new Error('not expected')
        },
        contacts: () => {
            throw new Error('not expected')
        },
        privacyToken: () => {
            throw new Error('not expected')
        }
    },
    caches: {
        retry: () => {
            throw new Error('not expected')
        },
        participants: () => {
            throw new Error('not expected')
        },
        deviceList: () => {
            throw new Error('not expected')
        }
    }
} as const

test('createStore requires providers.auth', () => {
    assert.throws(() => createStore({}).session('default'), /providers.auth is required/)
})

test('createStore session lifecycle with backend + memory', async () => {
    const store = createStore({
        backends: { mock: mockAuthBackend },
        providers: {
            auth: 'mock',
            messages: 'memory',
            threads: 'memory',
            contacts: 'memory'
        }
    })

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
})

test('createStore rejects unknown backend name', () => {
    assert.throws(
        () =>
            createStore({
                backends: { db: mockAuthBackend },
                providers: { auth: 'unknown' as 'db' }
            }).session('x'),
        /unknown backend/
    )
})
