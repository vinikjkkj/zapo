import assert from 'node:assert/strict'
import test from 'node:test'

import { createStore, WaAuthMemoryStore, WaClient, type WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

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

async function waitForServerStaticKey(
    authStore: WaAuthMemoryStore,
    timeoutMs = 5_000
): Promise<void> {
    const deadline = Date.now() + timeoutMs
    for (;;) {
        const creds = await authStore.load()
        if (creds?.meJid && creds.serverStaticKey?.byteLength === 32) {
            return
        }
        if (Date.now() >= deadline) {
            throw new Error('timed out waiting for server static key to be cached')
        }
        await new Promise((resolve) => setTimeout(resolve, 25))
    }
}

test('resume handshake: server static key is withheld until registered, then reconnect uses IK', async () => {
    const server = await FakeWaServer.start()
    const authStore = new WaAuthMemoryStore()

    try {
        const firstClient = buildClientFor(server, authStore, 'resume-1')

        const materialPromise = new Promise<{
            readonly advSecretKey: Uint8Array
            readonly identityPublicKey: Uint8Array
        }>((resolve) => {
            firstClient.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
                const parsed = parsePairingQrString(event.qr)
                resolve({
                    advSecretKey: parsed.advSecretKey,
                    identityPublicKey: parsed.identityPublicKey
                })
            })
        })
        const pairedPromise = waitForEvent(firstClient, 'auth_paired', 60_000)

        await firstClient.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        // The unregistered (pre-pairing) connection does the full XX handshake and
        // must NOT cache the server static key, matching WhatsApp Web.
        const unregisteredCreds = await authStore.load()
        assert.ok(unregisteredCreds, 'auth store should have credentials after first connect')
        assert.equal(
            unregisteredCreds.meJid ?? null,
            null,
            'session should still be unregistered before pairing'
        )
        assert.equal(
            unregisteredCreds.serverStaticKey ?? null,
            null,
            'server static key must not be cached while unregistered'
        )

        const reconnectPipelinePromise = server.waitForNextAuthenticatedPipeline()
        await server.runPairing(
            pipeline,
            { deviceJid: '5511999999999:1@s.whatsapp.net' },
            () => materialPromise
        )
        await pairedPromise
        await reconnectPipelinePromise

        // The registered reconnect caches the server static key.
        await waitForServerStaticKey(authStore)
        await firstClient.disconnect()

        // A fresh registered connection now resumes via the IK handshake.
        const secondClient = buildClientFor(server, authStore, 'resume-2')
        const secondSuccess = waitForEvent(secondClient, 'debug_connection_success')
        await secondClient.connect()
        await secondSuccess

        await secondClient.disconnect()
    } finally {
        await server.stop()
    }
})
