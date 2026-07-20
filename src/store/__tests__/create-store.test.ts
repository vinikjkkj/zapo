import assert from 'node:assert/strict'
import test from 'node:test'

import { createStore } from '@store/createStore'
import { WaLidPnMappingMemoryStore } from '@store/memory/lid-pn-mapping.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'

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
        groupMetadata: () => {
            throw new Error('not expected')
        },
        deviceList: () => {
            throw new Error('not expected')
        },
        messageSecret: () => {
            throw new Error('not expected')
        }
    }
} as const

test('createStore defaults auth to in-memory when no provider is set', async () => {
    const store = createStore({})
    const session = store.session('default')
    assert.equal(await session.auth.load(), null)

    const credentials = {
        noiseKeyPair: { pubKey: new Uint8Array(32), privKey: new Uint8Array(32) },
        registrationInfo: {
            registrationId: 1,
            identityKeyPair: { pubKey: new Uint8Array(33), privKey: new Uint8Array(32) }
        },
        signedPreKey: {
            keyId: 1,
            keyPair: { pubKey: new Uint8Array(33), privKey: new Uint8Array(32) },
            signature: new Uint8Array(64)
        },
        advSecretKey: new Uint8Array(32)
    } as const
    await session.auth.save(credentials)
    assert.deepEqual(await session.auth.load(), credentials)
    await session.auth.clear()
    assert.equal(await session.auth.load(), null)

    await store.destroy()
})

test('createStore session lifecycle with backend + memory', async () => {
    const store = createStore({
        backends: { mock: mockAuthBackend },
        providers: {
            auth: 'mock',
            signal: 'memory',
            preKey: 'memory',
            session: 'memory',
            identity: 'memory',
            senderKey: 'memory',
            appState: 'memory',
            privacyToken: 'memory',
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
                providers: {
                    auth: 'unknown' as 'db',
                    signal: 'memory',
                    preKey: 'memory',
                    session: 'memory',
                    identity: 'memory',
                    senderKey: 'memory',
                    appState: 'memory',
                    privacyToken: 'memory',
                    messages: 'none',
                    threads: 'none',
                    contacts: 'none'
                }
            }).session('x'),
        /unknown backend/
    )
})

test('createStore throws when backends is set but providers omit persistence domains', () => {
    // Type-system also catches this at compile time via the strict overload;
    // we cast to bypass and assert the runtime guard is still in place for
    // JS callers / `as any` users.
    assert.throws(
        () =>
            createStore({
                backends: { mock: mockAuthBackend },
                providers: { auth: 'mock' }
            } as never),
        /Missing: providers\.signal.*providers\.preKey.*providers\.session.*providers\.identity.*providers\.senderKey.*providers\.appState.*providers\.messages.*providers\.threads.*providers\.contacts.*providers\.privacyToken/s
    )
})

test('createStore allows omitting cacheProviders when backends is set (caches default to memory)', () => {
    const store = createStore({
        backends: { mock: mockAuthBackend },
        providers: {
            auth: 'mock',
            signal: 'memory',
            preKey: 'memory',
            session: 'memory',
            identity: 'memory',
            senderKey: 'memory',
            appState: 'memory',
            privacyToken: 'memory',
            messages: 'none',
            threads: 'none',
            contacts: 'none'
        }
        // cacheProviders intentionally omitted
    })
    const session = store.session('x')
    assert.ok(session.retry)
    assert.ok(session.groupMetadata)
    assert.ok(session.deviceList)
    assert.ok(session.messageSecret)
})

test('createStore couples the PN/LID mapping provider to the session backend', async () => {
    const mappings = new WaLidPnMappingMemoryStore()
    const backend = {
        ...mockAuthBackend,
        stores: {
            ...mockAuthBackend.stores,
            session: () => new WaSessionMemoryStore(),
            lidPnMapping: () => mappings
        }
    }
    const store = createStore({
        backends: { mock: backend },
        providers: {
            auth: 'memory',
            signal: 'memory',
            preKey: 'memory',
            session: 'mock',
            identity: 'memory',
            senderKey: 'memory',
            appState: 'memory',
            privacyToken: 'memory',
            messages: 'none',
            threads: 'none',
            contacts: 'none'
        }
    })

    const session = store.session('mapping-session')
    await session.lidPnMapping!.setLidUser('5511999999999', '778899')
    assert.equal(await mappings.getLidUser('5511999999999'), '778899')
    await store.destroy()
})
