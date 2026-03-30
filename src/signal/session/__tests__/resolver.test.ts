import assert from 'node:assert/strict'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import { createSignalSessionResolver } from '@signal/session/resolver'
import type { SignalPreKeyBundle } from '@signal/types'
import { delay } from '@util/async'

async function flushMicrotasks(turns = 3): Promise<void> {
    for (let index = 0; index < turns; index += 1) {
        await Promise.resolve()
    }
}

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
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
        logger: createLogger()
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
        logger: createLogger()
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
        logger: createLogger()
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

    const resolver = createSignalSessionResolver({
        signalProtocol: {
            hasSession: async () => hasSession,
            establishOutgoingSession: async () => {
                establishCalls += 1
                hasSession = true
                return sessionRecord
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
        logger: createLogger()
    })

    const single = resolver.ensureSession(address, jid)
    await flushMicrotasks(4)
    const batch = resolver.ensureSessionsBatch([jid])

    t.mock.timers.tick(20)
    await flushMicrotasks(8)
    const [, batchResult] = await Promise.all([single, batch])

    assert.equal(fetchCalls, 1)
    assert.equal(fetchBatchCalls, 1)
    assert.equal(establishCalls, 1)
    assert.equal(batchResult.length, 1)
    assert.equal(batchResult[0].jid, jid)
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
        logger: createLogger()
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
