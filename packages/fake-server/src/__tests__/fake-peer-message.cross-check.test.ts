/**
 * Phase 8 cross-check: end-to-end Signal-encrypted message exchange.
 *
 * Scenario:
 *   1. Real `WaClient` connects to the fake server (XX handshake).
 *   2. Server pushes `<notification type="encrypt"><count value="0"/>`.
 *   3. Lib reacts by sending the PreKey upload IQ.
 *   4. Fake server captures the bundle, replies with `<iq type="result"/>`.
 *   5. Test asks the fake server to create a `FakePeer` that uses the
 *      captured bundle to run X3DH.
 *   6. The peer encrypts a `conversation: 'hello'` message into a
 *      PreKeySignalMessage, wraps it in `<message><enc type="pkmsg"/>`,
 *      and pushes it.
 *   7. The lib decrypts via its real Signal layer and emits the `message`
 *      event with the decoded `proto.IMessage`.
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

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

test('fake peer encrypts a Signal message and the lib emits message event', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'fake-peer-msg' })

    const messagePromise = waitForEvent(client, 'message', 8_000)

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        // Trigger the lib to upload its prekeys; the server-side handler
        // captures the bundle automatically.
        await server.triggerPreKeyUpload(pipeline)

        const peer = await server.createFakePeer(
            { jid: '5511888888888@s.whatsapp.net', displayName: 'Fake Peer' },
            pipeline
        )

        await peer.sendConversation('hello from the fake server')

        const [event] = await messagePromise
        assert.ok(event.message, 'message event should carry a decoded Message proto')
        assert.equal(event.message?.conversation, 'hello from the fake server')
        assert.equal(event.senderJid, '5511888888888@s.whatsapp.net')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
