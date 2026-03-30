import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaAuthCredentials } from '@auth/types'
import { WaAuthClient } from '@auth/WaAuthClient'
import type { Logger } from '@infra/log/types'
import { WaPreKeyMemoryStore } from '@store/providers/memory/pre-key.store'
import { WaSignalMemoryStore } from '@store/providers/memory/signal.store'

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
            logger: createLogger(),
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

test('WaAuthClient throws when credentials are required but missing', async () => {
    const auth = createInMemoryAuthStore(null)
    const client = new WaAuthClient(
        {
            deviceBrowser: 'Chrome'
        },
        {
            logger: createLogger(),
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
