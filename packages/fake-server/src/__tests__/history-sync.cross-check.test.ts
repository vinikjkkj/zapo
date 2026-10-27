import assert from 'node:assert/strict'
import test from 'node:test'

import {
    type WaClient,
    type WaClientEventMap,
    type WaHistorySyncChunkEvent,
    type WaHistorySyncItem
} from 'zapo-js'

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

test('history.sink receives the streamed content with every mailbox store disabled', async () => {
    const server = await FakeWaServer.start()
    const items: WaHistorySyncItem[] = []
    const commits: WaHistorySyncChunkEvent[] = []
    const { client } = createZapoClient(server, {
        sessionId: 'history-sync-sink',
        historySink: {
            item: (item) => {
                items.push(item)
            },
            commit: (chunk) => {
                commits.push(chunk)
            }
        }
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
                    messages: [
                        {
                            id: 'sink-msg-1',
                            fromMe: false,
                            timestamp: 1_700_000_000,
                            message: { conversation: 'streamed to the sink' }
                        }
                    ]
                }
            ],
            pushnames: [{ id: '5511777777777@s.whatsapp.net', pushname: 'Friend Display' }]
        })

        const [event] = await chunkPromise
        assert.ok(event.id.length > 0, 'the chunk event names its carrier message')
        assert.deepEqual(commits, [event])

        const message = items.find((item) => item.kind === 'conversations.messages')
        assert.ok(message && message.kind === 'conversations.messages')
        assert.equal(message.conversationId, '5511777777777@s.whatsapp.net')
        assert.equal(message.value.message?.key?.id, 'sink-msg-1')
        assert.equal(message.value.message?.message?.conversation, 'streamed to the sink')

        const conversation = items.find((item) => item.kind === 'conversations')
        assert.ok(conversation && conversation.kind === 'conversations')
        assert.equal(conversation.value.name, 'Friend')

        const pushname = items.find((item) => item.kind === 'pushnames')
        assert.ok(pushname && pushname.kind === 'pushnames')
        assert.equal(pushname.value.pushname, 'Friend Display')

        const progress = items.find((item) => item.kind === 'progress')
        assert.ok(progress && progress.kind === 'progress')
        assert.equal(progress.value, 100)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
