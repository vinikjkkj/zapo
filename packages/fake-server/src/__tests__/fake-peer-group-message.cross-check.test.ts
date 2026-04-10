import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

function waitForMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs = 8_000
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

test('fake peer sends a SenderKey-encrypted group message and lib emits message with groupJid', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'fake-peer-group-msg' })

    const groupJid = '120363000000000000@g.us'
    const peerJid = '5511777777777@s.whatsapp.net'

    const messagePromise = waitForMessage(
        client,
        (event) => event.chatJid === groupJid && event.message?.conversation === 'hello group'
    )

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        await server.triggerPreKeyUpload(pipeline)

        const peer = await server.createFakePeer(
            { jid: peerJid, displayName: 'Group Peer' },
            pipeline
        )

        await peer.sendGroupConversation(groupJid, 'hello group')

        const event = await messagePromise
        assert.equal(event.chatJid, groupJid)
        assert.equal(event.senderJid, peerJid)
        assert.equal(event.isGroupChat, true)
        assert.equal(event.message?.conversation, 'hello group')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
