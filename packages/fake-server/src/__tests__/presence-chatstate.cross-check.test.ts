import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildChatstate } from '../protocol/push/chatstate'
import { buildIncomingPresence } from '../protocol/push/presence'

import { createZapoClient } from './helpers/zapo-client'

test('fake server pushes presence stanzas and the lib emits enriched presence events', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'presence-stanza' })
    const peerJid = '5511777777777@s.whatsapp.net'
    const groupJid = '120363000000000000@g.us'

    const events: {
        readonly chatJid?: string
        readonly type: 'available' | 'unavailable'
        readonly lastSeen?: { readonly kind: string; readonly unixSeconds?: number }
        readonly groupOnlineCount?: number
    }[] = []
    const expected = 3
    const presencePromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for presence events')),
            5_000
        )
        client.on('presence', (event) => {
            events.push({
                chatJid: event.chatJid,
                type: event.type,
                lastSeen: event.lastSeen,
                groupOnlineCount: event.groupOnlineCount
            })
            if (events.length >= expected) {
                clearTimeout(timer)
                resolve()
            }
        })
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await pipeline.sendStanza(buildIncomingPresence({ from: peerJid, type: 'available' }))
        await pipeline.sendStanza(
            buildIncomingPresence({ from: peerJid, type: 'unavailable', last: 1700000000 })
        )
        await pipeline.sendStanza(buildIncomingPresence({ from: groupJid, type: 'unavailable' }))

        await presencePromise

        assert.deepEqual(events[0], {
            chatJid: peerJid,
            type: 'available',
            lastSeen: undefined,
            groupOnlineCount: undefined
        })
        assert.deepEqual(events[1], {
            chatJid: peerJid,
            type: 'unavailable',
            lastSeen: { kind: 'timestamp', unixSeconds: 1700000000 },
            groupOnlineCount: undefined
        })
        assert.deepEqual(events[2], {
            chatJid: groupJid,
            type: 'unavailable',
            lastSeen: undefined,
            groupOnlineCount: 0
        })
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('fake server pushes chatstate stanzas and the lib emits enriched chatstate events', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'chatstate-stanza' })
    const peerJid = '5511777777777@s.whatsapp.net'

    const events: {
        readonly chatJid?: string
        readonly state: 'composing' | 'paused'
        readonly media?: 'audio'
    }[] = []
    const chatstatePromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for chatstate events')),
            5_000
        )
        client.on('chatstate', (event) => {
            events.push({ chatJid: event.chatJid, state: event.state, media: event.media })
            if (events.length >= 2) {
                clearTimeout(timer)
                resolve()
            }
        })
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await pipeline.sendStanza(
            buildChatstate({ from: peerJid, state: { kind: 'composing', media: 'audio' } })
        )
        await pipeline.sendStanza(buildChatstate({ from: peerJid, state: { kind: 'paused' } }))

        await chatstatePromise

        assert.deepEqual(events[0], {
            chatJid: peerJid,
            state: 'composing',
            media: 'audio'
        })
        assert.deepEqual(events[1], {
            chatJid: peerJid,
            state: 'paused',
            media: undefined
        })
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('the lib sends presence subscribe and chatstate stanzas the server captures', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'chatstate-out' })
    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        const subscribePromise = server.expectStanza(
            { tag: 'presence', type: 'subscribe', to: peerJid },
            { timeoutMs: 2_000 }
        )
        await client.subscribePresence(peerJid)
        await subscribePromise

        await client.sendChatstate(peerJid, { state: 'composing' })
        await client.sendChatstate(peerJid, { state: 'composing', media: 'audio' })
        const pausedPromise = server.expectStanza(
            { tag: 'chatstate', to: peerJid, childTag: 'paused' },
            { timeoutMs: 2_000 }
        )
        await client.sendChatstate(peerJid, { state: 'paused' })
        await pausedPromise

        const chatstates = server
            .capturedStanzaSnapshot()
            .filter((node) => node.tag === 'chatstate' && node.attrs.to === peerJid)
        assert.equal(chatstates.length, 3)
        const childOf = (node: { readonly content?: unknown }) =>
            Array.isArray(node.content) ? node.content[0] : null
        const composing = childOf(chatstates[0])
        const recording = childOf(chatstates[1])
        const paused = childOf(chatstates[2])
        assert.equal(composing?.tag, 'composing')
        assert.equal(composing?.attrs.media, undefined)
        assert.equal(recording?.tag, 'composing')
        assert.equal(recording?.attrs.media, 'audio')
        assert.equal(paused?.tag, 'paused')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
