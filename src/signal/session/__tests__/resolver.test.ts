import assert from 'node:assert/strict'
import test from 'node:test'

import { createNoopLogger } from '@infra/log/types'
import { createSignalSessionResolver } from '@signal/session/resolver'
import { SignalAddressResolver } from '@signal/session/SignalAddressResolver'
import type { SignalPreKeyBundle } from '@signal/types'
import { WaLidPnMappingMemoryStore } from '@store/memory/lid-pn-mapping.store'
import { delay } from '@util/async'

async function flushMicrotasks(turns = 3): Promise<void> {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve()
    }
}

function buildBundle(seed: number): SignalPreKeyBundle {
    return {
        regId: seed,
        identity: new Uint8Array(32).fill(seed),
        signedKey: {
            id: seed,
            publicKey: new Uint8Array(32).fill(seed + 1),
            signature: new Uint8Array(64).fill(seed + 2)
        },
        oneTimeKey: {
            id: seed + 3,
            publicKey: new Uint8Array(32).fill(seed + 4)
        }
    }
}

test('signal session resolver treats mapped PN and LID targets as one existing session', async () => {
    const addressResolver = new SignalAddressResolver(new WaLidPnMappingMemoryStore())
    await addressResolver.learnMessageJidPair('5511999999999@s.whatsapp.net', '778899@lid')

    const existingSession = {} as never
    const checkedAddresses: { readonly user: string; readonly server?: string }[] = []
    let singleFetchCalls = 0
    let batchFetchCalls = 0
    const sessionResolver = createSignalSessionResolver({
        signalProtocol: {
            establishOutgoingSession: async () => {
                throw new Error('must not establish a replacement session')
            }
        } as never,
        sessionStore: {
            hasSession: async (address: { readonly user: string; readonly server?: string }) => {
                checkedAddresses.push(address)
                return address.user === '778899' && address.server === 'lid'
            },
            getSessionsBatch: async (
                addresses: readonly { readonly user: string; readonly server?: string }[]
            ) => {
                checkedAddresses.push(...addresses)
                return addresses.map((address) =>
                    address.user === '778899' && address.server === 'lid' ? existingSession : null
                )
            }
        } as never,
        identityStore: {
            getRemoteIdentity: async () => null
        } as never,
        signalIdentitySync: {
            syncIdentityKeys: async () => undefined
        } as never,
        signalSessionSync: {
            fetchKeyBundle: async () => {
                singleFetchCalls += 1
                throw new Error('must not fetch a replacement key bundle')
            },
            fetchKeyBundles: async () => {
                batchFetchCalls += 1
                throw new Error('must not fetch replacement key bundles')
            }
        } as never,
        addressResolver,
        logger: createNoopLogger()
    })

    await sessionResolver.ensureSession(
        { user: '5511999999999', server: 's.whatsapp.net', device: 2 },
        '5511999999999:2@s.whatsapp.net'
    )
    const batch = await sessionResolver.ensureSessionsBatch([
        '5511999999999:2@s.whatsapp.net',
        '778899:2@lid'
    ])

    assert.equal(singleFetchCalls, 0)
    assert.equal(batchFetchCalls, 0)
    assert.equal(checkedAddresses.length, 2)
    assert.ok(checkedAddresses.every((address) => address.user === '778899'))
    assert.deepEqual(batch, [
        {
            jid: '5511999999999:2@s.whatsapp.net',
            address: { user: '778899', server: 'lid', device: 2 },
            session: existingSession
        }
    ])
})

test('signal session resolver rejects conflicting identities for PN/LID aliases', async () => {
    const addressResolver = new SignalAddressResolver(new WaLidPnMappingMemoryStore())
    await addressResolver.learnMessageJidPair('5511999999999@s.whatsapp.net', '778899@lid')
    let storeReads = 0
    const sessionResolver = createSignalSessionResolver({
        signalProtocol: {} as never,
        sessionStore: {
            getSessionsBatch: async () => {
                storeReads += 1
                return []
            }
        } as never,
        identityStore: {} as never,
        signalIdentitySync: {} as never,
        signalSessionSync: {} as never,
        addressResolver,
        logger: createNoopLogger()
    })

    await assert.rejects(
        sessionResolver.ensureSessionsBatch(
            ['5511999999999:2@s.whatsapp.net', '778899:2@lid'],
            new Map([
                ['5511999999999:2@s.whatsapp.net', new Uint8Array(32).fill(1)],
                ['778899:2@lid', new Uint8Array(32).fill(2)]
            ])
        ),
        /identity mismatch/
    )
    assert.equal(storeReads, 0)
})

test('signal session resolver rejects identity mismatch on reasonIdentity sync', async () => {
    let syncedIdentityKeys = 0

    const resolver = createSignalSessionResolver({
        signalProtocol: {
            hasSession: async () => false,
            establishOutgoingSession: async () => undefined
        } as never,
        sessionStore: {
            hasSession: async () => false
        } as never,
        identityStore: {
            getRemoteIdentity: async () => new Uint8Array(33).fill(9)
        } as never,
        signalIdentitySync: {
            syncIdentityKeys: async () => {
                syncedIdentityKeys += 1
            }
        } as never,
        signalSessionSync: {
            fetchKeyBundle: async () => ({
                jid: '5511999999999:2@s.whatsapp.net',
                bundle: buildBundle(1)
            })
        } as never,
        logger: createNoopLogger()
    })

    await assert.rejects(
        resolver.ensureSession(
            {
                user: '5511999999999',
                device: 2,
                server: 's.whatsapp.net'
            },
            '5511999999999:2@s.whatsapp.net',
            undefined,
            true
        ),
        /identity mismatch/
    )

    assert.equal(syncedIdentityKeys, 1)
})

test('signal session resolver batch does not fallback to single fetch for partial failures', async () => {
    const established: string[] = []
    const sessionsByAddress = new Map<string, unknown>()
    let batchFetchCalls = 0
    let singleFetchCalls = 0
    const toKey = (address: { readonly user: string; readonly device: number }): string =>
        `${address.user}:${address.device}`

    const resolver = createSignalSessionResolver({
        signalProtocol: {
            hasSession: async (address: { readonly user: string; readonly device: number }) =>
                sessionsByAddress.has(toKey(address)),
            establishOutgoingSession: async (address: {
                readonly user: string
                readonly device: number
            }) => {
                const key = toKey(address)
                established.push(key)
                const session = {} as never
                sessionsByAddress.set(key, session)
                return session
            },
            prepareOutgoingSession: async (address: {
                readonly user: string
                readonly device: number
            }) => {
                const session = {} as never
                return { session, remoteIdentity: new Uint8Array(33), reusedExisting: false }
            },
            persistOutgoingSessionsBatch: async (
                entries: ReadonlyArray<{
                    readonly address: { readonly user: string; readonly device: number }
                    readonly session: unknown
                }>
            ) => {
                const resolved = entries.map((e) => {
                    const key = toKey(e.address)
                    established.push(key)
                    sessionsByAddress.set(key, e.session)
                    return { address: e.address, session: e.session }
                })
                return { resolved, skipped: [] }
            }
        } as never,
        sessionStore: {
            hasSession: async (address: { readonly user: string; readonly device: number }) =>
                sessionsByAddress.has(toKey(address)),
            getSessionsBatch: async (
                addresses: readonly { readonly user: string; readonly device: number }[]
            ) => {
                const out = new Array<unknown>(addresses.length)
                for (let index = 0; index < addresses.length; index += 1) {
                    out[index] = sessionsByAddress.get(toKey(addresses[index])) ?? null
                }
                return out
            }
        } as never,
        identityStore: {
            getRemoteIdentity: async () => null
        } as never,
        signalIdentitySync: {
            syncIdentityKeys: async () => undefined
        } as never,
        signalSessionSync: {
            fetchKeyBundles: async () => {
                batchFetchCalls += 1
                return [
                    {
                        jid: '5511888888888:1@s.whatsapp.net',
                        bundle: buildBundle(2)
                    },
                    {
                        jid: '5511777777777:2@s.whatsapp.net',
                        errorText: 'not found'
                    }
                ]
            },
            fetchKeyBundle: async () => {
                singleFetchCalls += 1
                return {
                    jid: '5511777777777:2@s.whatsapp.net',
                    bundle: buildBundle(3)
                }
            }
        } as never,
        logger: createNoopLogger()
    })

    const resolvedTargets = await resolver.ensureSessionsBatch([
        '5511888888888:1@s.whatsapp.net',
        '5511777777777:2@s.whatsapp.net'
    ])

    assert.equal(batchFetchCalls, 1)
    assert.equal(singleFetchCalls, 0)
    assert.deepEqual(established, ['5511888888888:1'])
    assert.deepEqual(
        [...resolvedTargets.map((target) => target.jid)],
        ['5511888888888:1@s.whatsapp.net']
    )
})

test('signal session resolver deduplicates concurrent ensureSession for same address', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let fetchCalls = 0
    let establishCalls = 0

    const resolver = createSignalSessionResolver({
        signalProtocol: {
            hasSession: async () => false,
            establishOutgoingSession: async () => {
                establishCalls += 1
            }
        } as never,
        sessionStore: {
            hasSession: async () => false
        } as never,
        identityStore: {
            getRemoteIdentity: async () => null
        } as never,
        signalIdentitySync: {
            syncIdentityKeys: async () => undefined
        } as never,
        signalSessionSync: {
            fetchKeyBundle: async () => {
                fetchCalls += 1
                await delay(20)
                return {
                    jid: '5511999999999:2@s.whatsapp.net',
                    bundle: buildBundle(7)
                }
            }
        } as never,
        logger: createNoopLogger()
    })

    const address = {
        user: '5511999999999',
        device: 2,
        server: 's.whatsapp.net'
    } as const
    const done = Promise.all([
        resolver.ensureSession(address, '5511999999999:2@s.whatsapp.net'),
        resolver.ensureSession(address, '5511999999999:2@s.whatsapp.net')
    ])
    await flushMicrotasks(4)
    t.mock.timers.tick(20)
    await flushMicrotasks(4)
    await done

    assert.equal(fetchCalls, 1)
    assert.equal(establishCalls, 1)
})

test('signal session resolver shares dedup between ensureSession and ensureSessionsBatch', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })

    let fetchCalls = 0
    let fetchBatchCalls = 0
    let establishCalls = 0
    let hasSession = false
    const sessionRecord = {} as never
    const jid = '5511999999999:2@s.whatsapp.net'
    const address = {
        user: '5511999999999',
        device: 2,
        server: 's.whatsapp.net'
    } as const

    let prepareCalls = 0
    let persistBatchCalls = 0
    const resolver = createSignalSessionResolver({
        signalProtocol: {
            hasSession: async () => hasSession,
            establishOutgoingSession: async () => {
                establishCalls += 1
                hasSession = true
                return sessionRecord
            },
            prepareOutgoingSession: async () => {
                prepareCalls += 1
                return {
                    session: sessionRecord,
                    remoteIdentity: new Uint8Array(33),
                    reusedExisting: false
                }
            },
            persistOutgoingSessionsBatch: async (
                entries: ReadonlyArray<{
                    readonly address: unknown
                    readonly session: unknown
                }>
            ) => {
                persistBatchCalls += 1
                const resolved = entries.map((e) => {
                    if (hasSession) {
                        return { address: e.address, session: sessionRecord }
                    }
                    hasSession = true
                    return { address: e.address, session: e.session }
                })
                return { resolved, skipped: [] }
            }
        } as never,
        sessionStore: {
            hasSession: async () => hasSession,
            getSessionsBatch: async () => [hasSession ? sessionRecord : null]
        } as never,
        identityStore: {
            getRemoteIdentity: async () => null
        } as never,
        signalIdentitySync: {
            syncIdentityKeys: async () => undefined
        } as never,
        signalSessionSync: {
            fetchKeyBundles: async () => {
                fetchBatchCalls += 1
                return [
                    {
                        jid,
                        bundle: buildBundle(8)
                    }
                ]
            },
            fetchKeyBundle: async () => {
                fetchCalls += 1
                await delay(20)
                return {
                    jid,
                    bundle: buildBundle(8)
                }
            }
        } as never,
        logger: createNoopLogger()
    })

    const single = resolver.ensureSession(address, jid)
    await flushMicrotasks(4)
    const batch = resolver.ensureSessionsBatch([jid])

    t.mock.timers.tick(20)
    await flushMicrotasks(8)
    const [, batchResult] = await Promise.all([single, batch])

    assert.equal(fetchCalls, 1)
    assert.equal(fetchBatchCalls, 1)
    // knownAbsent is part of the dedup key: single-call and batch
    // both compute independently. Persist-time recheck makes whichever
    // finishes first the winner; the other defers.
    assert.equal(establishCalls + prepareCalls, 2)
    assert.equal(persistBatchCalls, 1)
    assert.equal(batchResult.length, 1)
    assert.equal(batchResult[0].jid, jid)
    assert.strictEqual(batchResult[0].session, sessionRecord)
})

test('signal session resolver keeps stricter identity checks for concurrent calls', async () => {
    let syncIdentityCalls = 0

    const resolver = createSignalSessionResolver({
        signalProtocol: {
            hasSession: async () => true,
            establishOutgoingSession: async () => undefined
        } as never,
        sessionStore: {
            hasSession: async () => true
        } as never,
        identityStore: {
            getRemoteIdentity: async () => new Uint8Array(33).fill(1)
        } as never,
        signalIdentitySync: {
            syncIdentityKeys: async () => {
                syncIdentityCalls += 1
            }
        } as never,
        signalSessionSync: {
            fetchKeyBundle: async () => ({
                jid: '5511999999999:2@s.whatsapp.net',
                bundle: buildBundle(7)
            })
        } as never,
        logger: createNoopLogger()
    })

    const address = {
        user: '5511999999999',
        device: 2,
        server: 's.whatsapp.net'
    } as const
    const results = await Promise.allSettled([
        resolver.ensureSession(address, '5511999999999:2@s.whatsapp.net'),
        resolver.ensureSession(
            address,
            '5511999999999:2@s.whatsapp.net',
            new Uint8Array(32).fill(9),
            true
        )
    ])

    assert.equal(results[0].status, 'fulfilled')
    assert.equal(results[1].status, 'rejected')
    if (results[1].status !== 'rejected') {
        throw new Error('strict ensureSession call should reject on identity mismatch')
    }
    assert.match(String(results[1].reason), /identity mismatch/)
    assert.equal(syncIdentityCalls, 1)
})
