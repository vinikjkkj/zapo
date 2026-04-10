import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

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

test('zapo-js client completes a full noise XX handshake against the fake server', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'fake-server-test' })

    try {
        const successPromise = waitForEvent(client, 'connection_success', 5_000)
        const connectionOpenPromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('timed out waiting for connection { status: open }')),
                5_000
            )
            client.on('connection', (event) => {
                if (event.status === 'open') {
                    clearTimeout(timer)
                    resolve()
                }
            })
        })

        await client.connect()

        const [event] = await successPromise
        assert.equal(event.node.tag, 'success')
        assert.ok(event.node.attrs.t, 'success node should carry a timestamp')

        await connectionOpenPromise
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
