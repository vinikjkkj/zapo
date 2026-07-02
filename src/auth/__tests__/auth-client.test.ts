import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaAuthCredentials } from '@auth/types'
import { WaAuthClient } from '@auth/WaAuthClient'
import { createNoopLogger } from '@infra/log/types'
import { WaPreKeyMemoryStore } from '@store/memory/pre-key.store'
import { WaSignalMemoryStore } from '@store/memory/signal.store'
import type { BinaryNode } from '@transport/types'

function createInMemoryAuthStore(initial: WaAuthCredentials | null = null) {
    let current = initial
    let saves = 0
    return {
        store: {
            load: async () => current,
            save: async (credentials: WaAuthCredentials) => {
                current = credentials
                saves += 1
            },
            clear: async () => {
                current = null
            }
        },
        getCurrent: () => current,
        getSaves: () => saves
    }
}

test('WaAuthClient creates credentials, persists fields and clears state', async () => {
    const auth = createInMemoryAuthStore(null)
    const signalStore = new WaSignalMemoryStore()
    const preKeyStore = new WaPreKeyMemoryStore()

    const client = new WaAuthClient(
        {
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows'
        },
        {
            logger: createNoopLogger(),
            authStore: auth.store,
            signalStore,
            preKeyStore,
            socket: {
                sendNode: async () => undefined,
                query: async () => ({ tag: 'iq', attrs: { type: 'result' } })
            }
        }
    )

    const created = await client.loadOrCreateCredentials()
    assert.ok(created.noiseKeyPair.pubKey.length > 0)
    assert.equal(client.getState(false).registered, false)

    await client.persistServerHasPreKeys(true)
    await client.persistRoutingInfo(new Uint8Array([1, 2, 3]))
    await client.persistSuccessAttributes({
        meLid: '123@lid',
        meDisplayName: 'Tester',
        accountCreationTs: 10
    })

    const persisted = client.getCurrentCredentials()
    assert.equal(persisted?.serverHasPreKeys, true)
    assert.deepEqual(persisted?.routingInfo, new Uint8Array([1, 2, 3]))
    assert.equal(persisted?.meLid, '123@lid')

    await client.clearRoutingInfo()
    assert.equal(client.getCurrentCredentials()?.routingInfo, undefined)

    await client.clearStoredCredentials()
    assert.equal(client.getCurrentCredentials(), null)
    assert.equal(auth.getCurrent(), null)
    assert.ok(auth.getSaves() >= 1)
})

test('WaAuthClient emits onPasskeyRequired when the server forces a passkey', async () => {
    const auth = createInMemoryAuthStore(null)
    const sent: BinaryNode[] = []
    let passkeyHasSigner: boolean | null = null

    const client = new WaAuthClient(
        {
            deviceBrowser: 'Chrome',
            deviceOsDisplayName: 'Windows'
        },
        {
            logger: createNoopLogger(),
            authStore: auth.store,
            signalStore: new WaSignalMemoryStore(),
            preKeyStore: new WaPreKeyMemoryStore(),
            socket: {
                sendNode: async (node: BinaryNode) => {
                    sent.push(node)
                },
                query: async () => ({ tag: 'iq', attrs: { type: 'result' } })
            },
            callbacks: {
                onPasskeyRequired: (hasSigner) => {
                    passkeyHasSigner = hasSigner
                }
            }
        }
    )

    const node: BinaryNode = {
        tag: 'notification',
        attrs: { from: 's.whatsapp.net', type: 'passkey_prologue_request', id: '1' }
    }
    const handled = await client.handleLinkCodeNotification(node)

    // no signPasskeyAssertion configured: hasSigner is false and the request is acked
    assert.equal(handled, true)
    assert.equal(passkeyHasSigner, false)
    assert.ok(
        sent.some((n) => n.tag === 'ack'),
        'the passkey prologue request was acked'
    )
})

test('WaAuthClient throws when credentials are required but missing', async () => {
    const auth = createInMemoryAuthStore(null)
    const client = new WaAuthClient(
        {
            deviceBrowser: 'Chrome'
        },
        {
            logger: createNoopLogger(),
            authStore: auth.store,
            signalStore: new WaSignalMemoryStore(),
            preKeyStore: new WaPreKeyMemoryStore(),
            socket: {
                sendNode: async () => undefined,
                query: async () => ({ tag: 'iq', attrs: { type: 'result' } })
            }
        }
    )

    await assert.rejects(
        () => client.requestPairingCode('5511999999999'),
        /credentials are not initialized/
    )
})
