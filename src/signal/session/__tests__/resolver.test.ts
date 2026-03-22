import assert from 'node:assert/strict'
import test from 'node:test'

import type { Logger } from '@infra/log/types'
import { createSignalSessionResolver } from '@signal/session/resolver'
import type { SignalPreKeyBundle } from '@signal/types'

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
        signalStore: {
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

test('signal session resolver batch falls back to single fetch for partial failures', async () => {
    const established: string[] = []

    const resolver = createSignalSessionResolver({
        signalProtocol: {
            hasSession: async () => false,
            establishOutgoingSession: async (address: {
                readonly user: string
                readonly device: number
            }) => {
                established.push(`${address.user}:${address.device}`)
                return {} as never
            }
        } as never,
        signalStore: {
            getSessionsBatch: async () => [null, null],
            getRemoteIdentity: async () => null
        } as never,
        signalIdentitySync: {
            syncIdentityKeys: async () => undefined
        } as never,
        signalSessionSync: {
            fetchKeyBundles: async () => [
                {
                    jid: '5511888888888:1@s.whatsapp.net',
                    bundle: buildBundle(2)
                },
                {
                    jid: '5511777777777:2@s.whatsapp.net',
                    errorText: 'not found'
                }
            ],
            fetchKeyBundle: async (target: { readonly jid: string }) => ({
                jid: target.jid,
                bundle: buildBundle(3)
            })
        } as never,
        logger: createLogger()
    })

    const resolvedTargets = await resolver.ensureSessionsBatch([
        '5511888888888:1@s.whatsapp.net',
        '5511777777777:2@s.whatsapp.net'
    ])

    assert.deepEqual(established.sort(), ['5511777777777:2', '5511888888888:1'])
    assert.deepEqual([...resolvedTargets.map((target) => target.jid)].sort(), [
        '5511777777777:2@s.whatsapp.net',
        '5511888888888:1@s.whatsapp.net'
    ])
})
