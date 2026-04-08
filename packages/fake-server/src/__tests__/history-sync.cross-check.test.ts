/**
 * Phase 16 cross-check: history sync notification end-to-end.
 *
 * Scenario:
 *   1. Real WaClient connects + completes the noise handshake.
 *   2. Lib uploads its prekeys (triggered by the fake server's
 *      "encrypt count low" notification).
 *   3. Test creates a FakePeer and calls `peer.sendHistorySync({...})`,
 *      which encrypts and pushes a `<message>` whose decrypted plaintext
 *      contains a `protocolMessage.historySyncNotification` carrying an
 *      inline, zlib-compressed `HistorySync` proto with two conversations,
 *      a single message in one of them, and one pushname.
 *   4. The lib's `processHistorySyncNotification` decompresses the inline
 *      payload, persists conversations + pushnames + messages via
 *      writeBehind, and emits a `history_sync_chunk` event with the
 *      observed counts.
 *   5. Test asserts the event payload matches the input.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

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
