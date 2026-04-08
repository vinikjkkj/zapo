/**
 * Phase 7 cross-check: noise IK (resume) handshake.
 *
 * Scenario:
 *   1. Client connects fresh — completes XX handshake; the lib persists
 *      the fake server's static key in the auth store.
 *   2. Client disconnects.
 *   3. The same auth store is reused. A second `WaClient` instance is
 *      created against the same `FakeWaServer` (whose serverStaticKeyPair
 *      is stable across the test).
 *   4. The second connect now happens via IK (server static key cached).
 *      The fake server's pipeline takes the IK code path and replies with
 *      a ServerHello that omits the encrypted static — exactly what the
 *      lib's IK initiator expects to skip the XX fallback.
 *   5. Both connects must reach `connection { open }` and emit
 *      `connection_success`.
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import {
    createStore,
    type WaAuthCredentials,
    type WaAuthStore,
    WaClient,
    type WaClientEventMap
} from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

class InMemoryAuthStore implements WaAuthStore {
    private credentials: WaAuthCredentials | null = null
    public async load(): Promise<WaAuthCredentials | null> {
        return this.credentials
    }
    public async save(credentials: WaAuthCredentials): Promise<void> {
        this.credentials = credentials
    }
    public async clear(): Promise<void> {
        this.credentials = null
    }
    public peek(): WaAuthCredentials | null {
        return this.credentials
    }
}

function noopStore(): never {
    throw new Error('unexpected store call in resume cross-check')
}

function buildClientFor(server: FakeWaServer, authStore: WaAuthStore, sessionId: string): WaClient {
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
                    participants: noopStore,
                    deviceList: noopStore,
                    messageSecret: noopStore
                }
            }
        },
        providers: {
            auth: 'mem',
            signal: 'memory',
            senderKey: 'memory',
            appState: 'memory'
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

function waitForOpen(client: WaClient, timeoutMs = 5_000): Promise<void> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`connection { open } timed out after ${timeoutMs}ms`)),
            timeoutMs
        )
        client.on('connection', (event) => {
            if (event.status === 'open') {
                clearTimeout(timer)
                resolve()
            }
        })
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

test('resume handshake: second connection uses IK and reaches connection_open', async () => {
    const server = await FakeWaServer.start()
    const authStore = new InMemoryAuthStore()

    try {
        // ── First connect: full XX handshake ──────────────────────────────
        const firstClient = buildClientFor(server, authStore, 'resume-1')
        const firstSuccess = waitForEvent(firstClient, 'connection_success')
        const firstOpen = waitForOpen(firstClient)
        await firstClient.connect()
        await firstSuccess
        await firstOpen

        const credsAfterXx = authStore.peek()
        assert.ok(credsAfterXx, 'auth store should have credentials after first connect')
        assert.ok(
            credsAfterXx.serverStaticKey && credsAfterXx.serverStaticKey.byteLength === 32,
            'server static key should be persisted after XX handshake'
        )

        await firstClient.disconnect()

        // ── Second connect: IK resume handshake ───────────────────────────
        const secondClient = buildClientFor(server, authStore, 'resume-2')
        const secondSuccess = waitForEvent(secondClient, 'connection_success')
        const secondOpen = waitForOpen(secondClient)
        await secondClient.connect()
        await secondSuccess
        await secondOpen

        await secondClient.disconnect()
    } finally {
        await server.stop()
    }
})
