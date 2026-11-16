import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildReceipt } from '../protocol/push/receipt'
import type { BinaryNode } from '../transport/codec'

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

// A receipt carries its first id on the stanza and the rest as <item> children
// of <list>, so a lone id produces no <list>.
const batchCases = [
    {
        label: 'three messages',
        sessionId: 'receipts-batch',
        ids: ['batch-id-1', 'batch-id-2', 'batch-id-3']
    },
    { label: 'two messages', sessionId: 'receipts-pair', ids: ['pair-1', 'pair-2'] },
    { label: 'a single message', sessionId: 'receipts-single', ids: ['solo-1'] }
] as const

for (const { label, sessionId, ids } of batchCases) {
    test(`client.sendReceipt acknowledges every id of ${label}`, async () => {
        const server = await FakeWaServer.start()
        const { client } = createZapoClient(server, { sessionId })

        const peerJid = '5511777777777@s.whatsapp.net'
        const expectedItems = ids.slice(1)

        try {
            await client.connect()
            await server.waitForAuthenticatedPipeline()

            const stanzaPromise = server.expectStanza({ tag: 'receipt' }, { timeoutMs: 5_000 })

            await client.message.sendReceipt(peerJid, [...ids], { type: 'read' })

            const stanza = await stanzaPromise
            assert.equal(stanza.attrs.id, ids[0])

            const list = Array.isArray(stanza.content)
                ? stanza.content.find((child) => child.tag === 'list')
                : undefined

            if (expectedItems.length === 0) {
                assert.equal(list, undefined, 'a lone id belongs on the attribute, with no <list>')
                return
            }

            assert.ok(list, 'expected a <list> child carrying the remaining ids')
            assert.ok(Array.isArray(list.content))
            assert.deepEqual(
                list.content.map((item: BinaryNode) => item.attrs.id),
                expectedItems
            )
        } finally {
            await client.disconnect().catch(() => undefined)
            await server.stop()
        }
    })
}
