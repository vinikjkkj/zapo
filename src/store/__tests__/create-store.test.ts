import assert from 'node:assert/strict'
import test, { type TestContext } from 'node:test'

import { createNoopLogger, type Logger } from '@infra/log/types'
import type { SenderKeyRecord, SignalAddress, SignalSessionRecord } from '@signal/types'
import { createStore } from '@store/createStore'
import { WaIdentityMemoryStore } from '@store/memory/identity.store'
import { WaPrivacyTokenMemoryStore } from '@store/memory/privacy-token.store'
import { SenderKeyMemoryStore } from '@store/memory/sender-key.store'
import { WaSessionMemoryStore } from '@store/memory/session.store'
import type { WaStoreBackend } from '@store/types'

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
        chatMetadata: () => {
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

    const second = store.session('repair')
    assert.notStrictEqual(second, first)

    await firstDestroy
    await assert.rejects(
        first.senderKey.getGroupSenderKeyList('123@g.us'),
        /shared-exclusive gate is closed/
    )
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

test('createStore destroyCaches rejects on teardown failure but still swaps fresh caches', async () => {
    let clearCalls = 0
    const failingBackend = {
        ...mockAuthBackend,
        caches: {
            ...mockAuthBackend.caches,
            groupMetadata: () => ({
                upsertGroupMetadata: async () => {},
                getGroupMetadata: async () => null,
                deleteGroupMetadata: async () => 0,
                cleanupExpired: async () => 0,
                clear: async () => {
                    clearCalls += 1
                    throw new Error('clear boom')
                }
            })
        }
    }
    const store = createStore({
        backends: { failing: failingBackend },
        providers: {
            auth: 'memory',
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
        },
        cacheProviders: { groupMetadata: 'failing' }
    })
    const session = store.session('x')

    await assert.rejects(session.destroyCaches(), /teardown failure/)
    assert.equal(clearCalls, 1)

    assert.strictEqual(store.session('x'), session)
    assert.equal(await session.groupMetadata.getGroupMetadata('123@g.us'), null)
    await session.retry.clear()

    await store.destroy()
    assert.equal(clearCalls, 2)
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

const NO_MEMORY_CACHES = {
    retry: 'none',
    groupMetadata: 'none',
    chatMetadata: 'none',
    deviceList: 'none',
    messageSecret: 'none'
} as const

/** Periods of the intervals still running: every `setInterval` not yet cleared. */
function trackIntervals(t: TestContext): () => number[] {
    const started = t.mock.method(globalThis, 'setInterval')
    const stopped = t.mock.method(globalThis, 'clearInterval')
    return () => {
        const cleared = new Set(stopped.mock.calls.map((call) => call.arguments[0]))
        return started.mock.calls
            .filter((call) => !cleared.has(call.result))
            .map((call) => call.arguments[1] as number)
    }
}

const signalBackend = () =>
    ({
        stores: {
            session: () => new WaSessionMemoryStore(),
            identity: () => new WaIdentityMemoryStore(),
            senderKey: () => new SenderKeyMemoryStore(),
            privacyToken: () => new WaPrivacyTokenMemoryStore()
        },
        caches: {}
    }) satisfies WaStoreBackend<'session' | 'identity' | 'senderKey' | 'privacyToken', never>

const SIGNAL_ON_BACKEND = {
    auth: 'memory',
    signal: 'memory',
    preKey: 'memory',
    session: 'backend',
    identity: 'backend',
    senderKey: 'backend',
    appState: 'memory',
    privacyToken: 'backend',
    messages: 'none',
    threads: 'none',
    contacts: 'none'
} as const

test('createStore rejects a cacheLayer ttlMs below 1_000 or not a safe integer', () => {
    for (const sessionMs of [0, 999, 1_500.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
        assert.throws(
            () => createStore({ cacheLayer: { session: true, ttlMs: { sessionMs } } }),
            /cacheLayer\.ttlMs\.sessionMs must be a safe integer >= 1000/
        )
    }
    assert.throws(
        () => createStore({ cacheLayer: { ttlMs: { privacyTokenMs: 1 } } }),
        /cacheLayer\.ttlMs\.privacyTokenMs must be a safe integer >= 1000/
    )
    assert.doesNotThrow(() =>
        createStore({
            backends: { backend: signalBackend() },
            providers: SIGNAL_ON_BACKEND,
            cacheLayer: { session: true, ttlMs: { sessionMs: 1_000 } }
        })
    )
})

test('createStore warns about a cacheLayer ttl on a domain that gets no L1', () => {
    const warnings: { readonly message: string; readonly context?: Record<string, unknown> }[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        warn: (message, context) => warnings.push({ message, context }),
        child: () => logger
    }
    createStore({
        backends: { backend: signalBackend() },
        providers: { ...SIGNAL_ON_BACKEND, identity: 'memory' },
        cacheLayer: {
            session: true,
            identity: true,
            senderKey: false,
            ttlMs: {
                sessionMs: 5_000,
                identityMs: 5_000,
                senderKeyMs: 5_000,
                privacyTokenMs: 5_000
            }
        },
        logger
    })
    createStore({ cacheLayer: { session: true, ttlMs: { sessionMs: 5_000 } }, logger })

    const message = 'cacheLayer ttl ignored: domain has no L1'
    assert.deepEqual(warnings, [
        { message, context: { domain: 'identity', cached: true, provider: 'memory' } },
        { message, context: { domain: 'senderKey', cached: false, provider: 'backend' } },
        { message, context: { domain: 'privacyToken', cached: false, provider: 'backend' } },
        { message, context: { domain: 'session', cached: true, provider: 'memory' } }
    ])
})

test('createStore runs one L1 sweep timer for every session and domain, until the last one goes', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const running = trackIntervals(t)
    const store = createStore({
        backends: { backend: signalBackend() },
        providers: SIGNAL_ON_BACKEND,
        cacheProviders: NO_MEMORY_CACHES,
        cacheLayer: {
            session: true,
            identity: true,
            senderKey: true,
            privacyToken: true,
            ttlMs: {
                sessionMs: 30 * 60_000,
                identityMs: 120_000,
                senderKeyMs: 5_000,
                privacyTokenMs: 60_000
            }
        }
    })
    assert.deepEqual(running(), [])

    const first = store.session('a')
    const second = store.session('b')
    const third = store.session('c')
    assert.deepEqual(running(), [2_500])

    await first.destroy()
    await second.destroy()
    assert.deepEqual(running(), [2_500])
    await third.destroy()
    assert.deepEqual(running(), [])

    store.session('d')
    assert.deepEqual(running(), [2_500])
    await store.destroy()
    assert.deepEqual(running(), [])
})

test('createStore applies cacheLayer ttlMs to the L1 in front of a backend', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    class CountingSessionStore extends WaSessionMemoryStore {
        public reads = 0

        public override async getSession(
            address: SignalAddress
        ): Promise<SignalSessionRecord | null> {
            this.reads += 1
            return super.getSession(address)
        }
    }
    const backendSessions = new CountingSessionStore()
    const counting = {
        stores: { session: () => backendSessions },
        caches: {}
    } satisfies WaStoreBackend<'session', never>
    const store = createStore({
        backends: { counting },
        providers: {
            auth: 'memory',
            signal: 'memory',
            preKey: 'memory',
            session: 'counting',
            identity: 'memory',
            senderKey: 'memory',
            appState: 'memory',
            privacyToken: 'memory',
            messages: 'none',
            threads: 'none',
            contacts: 'none'
        },
        cacheLayer: { session: true, ttlMs: { sessionMs: 1_000 } }
    })
    const session = store.session('s')
    const address: SignalAddress = { user: 'peer', device: 0 }
    const record = { marker: 1 } as unknown as SignalSessionRecord

    await session.session.setSession(address, record) // write-through fills the L1
    t.mock.timers.tick(1_000)
    assert.deepEqual(await session.session.getSession(address), record)
    assert.equal(backendSessions.reads, 0)

    t.mock.timers.tick(2_000) // untouched for two ticks: the L1 drops it, the backend row stays
    assert.deepEqual(await session.session.getSession(address), record)
    assert.equal(backendSessions.reads, 1)

    await store.destroy()
})

test('createStore rejects a cacheLayer privacyToken limit that is not a positive safe integer', () => {
    for (const privacyToken of [0, Number.NaN]) {
        const store = createStore({
            backends: { backend: signalBackend() },
            providers: SIGNAL_ON_BACKEND,
            cacheLayer: { privacyToken: true, limits: { privacyToken } }
        })
        assert.throws(
            () => store.session('s'),
            /WaPrivacyTokenMemoryStore\.maxEntries must be a positive safe integer/
        )
    }
})

test('session.destroy() leaves public memory stores shared as a backend intact', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const sessions = new WaSessionMemoryStore()
    const identities = new WaIdentityMemoryStore()
    const senderKeys = new SenderKeyMemoryStore()
    const shared = {
        stores: {
            session: () => sessions,
            identity: () => identities,
            senderKey: () => senderKeys
        },
        caches: {}
    } satisfies WaStoreBackend<'session' | 'identity' | 'senderKey', never>
    const address: SignalAddress = { user: 'peer', device: 0 }
    const senderKey: SenderKeyRecord = {
        groupId: 'g',
        sender: address,
        keyId: 1,
        iteration: 0,
        chainKey: new Uint8Array([1]),
        signingPublicKey: new Uint8Array([2])
    }
    const withL1 = {
        session: true,
        identity: true,
        senderKey: true,
        ttlMs: { sessionMs: 60_000, identityMs: 60_000, senderKeyMs: 60_000 }
    }

    for (const [id, cacheLayer] of [
        ['plain', undefined],
        ['cached', withL1]
    ] as const) {
        const store = createStore({
            backends: { shared },
            providers: {
                ...SIGNAL_ON_BACKEND,
                session: 'shared',
                identity: 'shared',
                senderKey: 'shared',
                privacyToken: 'memory'
            },
            cacheLayer
        })
        const session = store.session(id)
        await session.session.setSession(address, { marker: id } as unknown as SignalSessionRecord)
        await session.identity.setRemoteIdentity(address, new Uint8Array([7]))
        await session.senderKey.upsertSenderKey(senderKey)
        await session.destroy()

        assert.ok(await sessions.getSession(address), id)
        assert.ok(await identities.getRemoteIdentity(address), id)
        assert.ok(await senderKeys.getDeviceSenderKey('g', address), id)
        await store.destroy()
    }
})
