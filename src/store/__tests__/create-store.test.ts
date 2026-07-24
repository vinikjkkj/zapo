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

test('createStore session destroy releases the id for a fresh reacquire', async () => {
    const store = createStore({})
    const first = store.session('repair')
    await first.senderKey.getGroupSenderKeyList('123@g.us')

    const firstDestroy = first.destroy()
    assert.strictEqual(first.destroy(), firstDestroy)
    await firstDestroy
    await assert.rejects(
        first.senderKey.getGroupSenderKeyList('123@g.us'),
        /shared-exclusive gate is closed/
    )

    const second = store.session('repair')
    assert.notStrictEqual(second, first)
    await second.senderKey.getGroupSenderKeyList('123@g.us')
    await second.deviceList.getUserDevicesBatch(['555@s.whatsapp.net'])
    await second.groupMetadata.getGroupMetadata('123@g.us')

    await store.destroy()
})

test('createStore destroyCaches keeps the session bundle usable', async () => {
    const store = createStore({})
    const session = store.session('caches')
    await session.groupMetadata.upsertGroupMetadata({
        groupJid: '123@g.us',
        participants: ['555@s.whatsapp.net'],
        updatedAtMs: Date.now()
    })
    const staleGroupMetadata = session.groupMetadata

    await Promise.all([session.destroyCaches(), session.destroyCaches()])

    assert.strictEqual(store.session('caches'), session)
    await assert.rejects(
        staleGroupMetadata.getGroupMetadata('123@g.us'),
        /shared-exclusive gate is closed/
    )
    assert.equal(await session.groupMetadata.getGroupMetadata('123@g.us'), null)
    await session.groupMetadata.upsertGroupMetadata({
        groupJid: '123@g.us',
        participants: ['555@s.whatsapp.net'],
        updatedAtMs: Date.now()
    })
    assert.ok(await session.groupMetadata.getGroupMetadata('123@g.us'))
    await session.senderKey.getGroupSenderKeyList('123@g.us')

    await store.destroy()
})

test('createStore defaults the deviceList cache to memory when cacheProviders is unset', async () => {
    const store = createStore({})
    const session = store.session('devices')
    await session.deviceList.upsertUserDevicesBatch([
        {
            userJid: '555@s.whatsapp.net',
            deviceJids: ['555:1@s.whatsapp.net'],
            updatedAtMs: Date.now()
        }
    ])
    const [snapshot] = await session.deviceList.getUserDevicesBatch(['555@s.whatsapp.net'])
    assert.ok(snapshot)
    assert.deepEqual(snapshot.deviceJids, ['555:1@s.whatsapp.net'])
    await store.destroy()
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
