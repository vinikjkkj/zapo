import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildReceipt } from '../protocol/push/receipt'

import { createZapoClient } from './helpers/zapo-client'

test('fake server pushes a read receipt and the lib emits receipt', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'receipts-inbound' })

    const peerJid = '5511777777777@s.whatsapp.net'
    const messageId = 'wa-msg-id-12345'

    const receiptPromise = new Promise<{
        readonly stanzaId?: string
        readonly chatJid?: string
        readonly status: string
        readonly fromSelfDevice: boolean
    }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timed out waiting for receipt')), 5_000)
        client.once('receipt', (event) => {
            clearTimeout(timer)
            resolve({
                stanzaId: event.stanzaId,
                chatJid: event.chatJid,
                status: event.status,
                fromSelfDevice: event.fromSelfDevice
            })
        })
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        await pipeline.sendStanza(
            buildReceipt({
                id: messageId,
                from: peerJid,
                type: 'read'
            })
        )

        const event = await receiptPromise
        assert.equal(event.stanzaId, messageId)
        assert.equal(event.chatJid, peerJid)
        assert.equal(event.status, 'read')
        assert.equal(event.fromSelfDevice, false)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.sendReceipt emits a real <receipt/> stanza captured by the fake server', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'receipts-outbound' })

    const peerJid = '5511777777777@s.whatsapp.net'
    const messageId = 'outbound-receipt-id'

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        const stanzaPromise = server.expectStanza({ tag: 'receipt' }, { timeoutMs: 5_000 })

        await client.message.sendReceipt(peerJid, messageId, { type: 'read' })

        const stanza = await stanzaPromise
        assert.equal(stanza.tag, 'receipt')
        assert.equal(stanza.attrs.id, messageId)
        assert.equal(stanza.attrs.to, peerJid)
        assert.equal(stanza.attrs.type, 'read')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.sendReceipt keeps every id when batching several messages', async () => {
    // Regression: dispatchReceipt used to pass only the ids AFTER the first as
    // `listIds`, but buildListItemsNode skips its own first element (that id
    // is already in `attrs.id`). The second id of every batch therefore
    // reached neither the attribute nor the <list>, so that message was never
    // acknowledged — a read receipt for three messages silently marked two.
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'receipts-batch' })

    const peerJid = '5511777777777@s.whatsapp.net'
    const ids = ['batch-id-1', 'batch-id-2', 'batch-id-3']

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        const stanzaPromise = server.expectStanza({ tag: 'receipt' }, { timeoutMs: 5_000 })

        await client.message.sendReceipt(peerJid, ids, { type: 'read' })

        const stanza = await stanzaPromise
        assert.equal(stanza.attrs.id, ids[0])
        const list = Array.isArray(stanza.content)
            ? stanza.content.find((child) => child.tag === 'list')
            : undefined
        assert.ok(list, 'expected a <list> child for a batched receipt')
        assert.ok(Array.isArray(list.content))
        assert.deepEqual(
            list.content.map((item) => item.attrs.id),
            [ids[1], ids[2]]
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('client.sendReceipt carries the second id of a two-message batch', async () => {
    // The narrowest form of the same bug: with two ids, `rest` had length 1
    // and buildListItemsNode returned null for it, so the second id vanished
    // entirely rather than merely being misplaced.
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'receipts-pair' })

    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        await client.connect()
        await server.waitForAuthenticatedPipeline()

        const stanzaPromise = server.expectStanza({ tag: 'receipt' }, { timeoutMs: 5_000 })

        await client.message.sendReceipt(peerJid, ['pair-1', 'pair-2'], { type: 'read' })

        const stanza = await stanzaPromise
        assert.equal(stanza.attrs.id, 'pair-1')
        const list = Array.isArray(stanza.content)
            ? stanza.content.find((child) => child.tag === 'list')
            : undefined
        assert.ok(list, 'expected a <list> child carrying the second id')
        assert.ok(Array.isArray(list.content))
        assert.deepEqual(
            list.content.map((item) => item.attrs.id),
            ['pair-2']
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
