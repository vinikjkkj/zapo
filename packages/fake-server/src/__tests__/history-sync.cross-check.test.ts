import assert from 'node:assert/strict'
import test from 'node:test'

import { type WaClient, type WaClientEventMap } from 'zapo-js'

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

test('fake peer pushes a history sync notification and the lib emits history_sync_chunk', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, {
        sessionId: 'history-sync',
        historySyncEnabled: true
    })

    const chunkPromise = waitForEvent(client, 'history_sync_chunk', 8_000)

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)

        const peer = await server.createFakePeer(
            { jid: '5511888888888@s.whatsapp.net', displayName: 'Primary Device' },
            pipeline
        )

        await peer.sendHistorySync({
            chunkOrder: 0,
            progress: 100,
            conversations: [
                {
                    id: '5511777777777@s.whatsapp.net',
                    name: 'Friend',
                    unreadCount: 2,
                    messages: [
                        {
                            id: 'history-msg-1',
                            fromMe: false,
                            timestamp: 1_700_000_000,
                            message: { conversation: 'an old message' }
                        }
                    ]
                },
                {
                    id: '120363000000000099@g.us',
                    name: 'Old Group',
                    unreadCount: 0
                }
            ],
            pushnames: [{ id: '5511777777777@s.whatsapp.net', pushname: 'Friend Display' }]
        })

        const [event] = await chunkPromise
        assert.equal(event.conversationsCount, 2)
        assert.equal(event.pushnamesCount, 1)
        assert.equal(event.messagesCount, 1)
        assert.equal(event.chunkOrder, 0)
        assert.equal(event.progress, 100)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
