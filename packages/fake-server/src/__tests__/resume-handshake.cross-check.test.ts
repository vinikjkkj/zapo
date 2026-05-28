import assert from 'node:assert/strict'
import test from 'node:test'

import { createStore, WaAuthMemoryStore, WaClient, type WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

function noopStore(): never {
    throw new Error('unexpected store call in resume cross-check')
}

function buildClientFor(
    server: FakeWaServer,
    authStore: WaAuthMemoryStore,
    sessionId: string
): WaClient {
    const store = createStore({
        backends: {
            mem: {
                stores: {
                    auth: () => authStore,
                    signal: noopStore,
                    preKey: noopStore,
                    session: noopStore,
                    identity: noopStore,
                    senderKey: noopStore,
                    appState: noopStore,
                    messages: noopStore,
                    threads: noopStore,
                    contacts: noopStore,
                    privacyToken: noopStore
                },
                caches: {
                    retry: noopStore,
                    groupMetadata: noopStore,
                    deviceList: noopStore,
                    messageSecret: noopStore
                }
            }
        },
        providers: {
            auth: 'mem',
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
    })
    return new WaClient({
        store,
        sessionId,
        chatSocketUrls: [server.url],
        connectTimeoutMs: 5_000,
        testHooks: { noiseRootCa: server.noiseRootCa }
    })
}

function waitForEvent<K extends keyof WaClientEventMap>(
    client: WaClient,
    event: K,
    timeoutMs = 5_000
): Promise<Parameters<WaClientEventMap[K]>> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timed out waiting for "${String(event)}"`)),
            timeoutMs
        )
        client.once(event, ((...args: Parameters<WaClientEventMap[K]>) => {
            clearTimeout(timer)
            resolve(args)
        }) as WaClientEventMap[K])
    })
}

test('resume handshake: second connection uses IK and reaches debug_connection_success', async () => {
    const server = await FakeWaServer.start()
    const authStore = new WaAuthMemoryStore()

    try {
        const firstClient = buildClientFor(server, authStore, 'resume-1')
        const firstSuccess = waitForEvent(firstClient, 'debug_connection_success')
        await firstClient.connect()
        await firstSuccess

        const credsAfterXx = await authStore.load()
        assert.ok(credsAfterXx, 'auth store should have credentials after first connect')
        assert.ok(
            credsAfterXx.serverStaticKey && credsAfterXx.serverStaticKey.byteLength === 32,
            'server static key should be persisted after XX handshake'
        )

        await firstClient.disconnect()

        const secondClient = buildClientFor(server, authStore, 'resume-2')
        const secondSuccess = waitForEvent(secondClient, 'debug_connection_success')
        await secondClient.connect()
        await secondSuccess

        await secondClient.disconnect()
    } finally {
        await server.stop()
    }
})
