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

test('fake peer pushes an ephemeral wrapped conversation and the lib emits message', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'ephemeral-message' })
    const peerJid = '5511777777777@s.whatsapp.net'
    const expirationSeconds = 7 * 24 * 60 * 60 // 7 days

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: peerJid }, pipeline)

        const messagePromise = waitForMessage(
            client,
            (event) => event.message?.ephemeralMessage !== undefined && event.message?.ephemeralMessage !== null
        )

        await peer.sendMessage({
            ephemeralMessage: {
                message: {
                    conversation: 'this self-destructs',
                    messageContextInfo: {
                        deviceListMetadataVersion: 2
                    }
                }
            },
            messageContextInfo: {
                deviceListMetadataVersion: 2
            },
            extendedTextMessage: undefined
        })

        const event = await messagePromise
        const ephemeral = event.message?.ephemeralMessage
        assert.ok(ephemeral, 'ephemeralMessage wrapper should be present')
        assert.equal(ephemeral.message?.conversation, 'this self-destructs')
        assert.equal(event.senderJid, peerJid)
        assert.equal(expirationSeconds, 604_800)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
