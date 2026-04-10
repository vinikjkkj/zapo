import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

function waitForMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs = 5_000
): Promise<Parameters<WaClientEventMap['message']>[0]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for matching message')),
            timeoutMs
        )
        const listener: WaClientEventMap['message'] = (event) => {
            if (predicate(event)) {
                clearTimeout(timer)
                client.off('message', listener)
                resolve(event)
            }
        }
        client.on('message', listener)
    })
}

test('fake peer pushes a status@broadcast message and the lib emits isBroadcastChat=true', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'status-broadcast' })
    const peerJid = '5511777777777@s.whatsapp.net'
    const statusText = 'a status update'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: peerJid }, pipeline)

        const messagePromise = waitForMessage(
            client,
            (event) => event.message?.conversation === statusText
        )

        await peer.sendMessage(
            { conversation: statusText },
            {
                from: 'status@broadcast',
                participant: peerJid
            }
        )

        const event = await messagePromise
        assert.equal(event.message?.conversation, statusText)
        assert.equal(event.chatJid, 'status@broadcast')
        assert.equal(event.isBroadcastChat, true)
        assert.equal(event.senderJid, peerJid)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
