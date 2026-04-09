/**
 * Phase 23 cross-check: receipts in both directions.
 *
 * Scenario A — fake server pushes a `<receipt/>` to the lib:
 *   1. Fake peer pushes a `<receipt id=msg-id type=read from=peer-jid t=...>`.
 *   2. The lib emits the `message_receipt` event with the receipt
 *      metadata.
 *
 * Scenario B — lib sends a `<receipt/>` via the public API:
 *   1. Test calls `client.sendReceipt({ to: peer-jid, id: msg-id, type: 'read' })`.
 *   2. The fake server captures the outbound `<receipt/>` stanza and
 *      asserts the attrs.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildReceipt } from '../protocol/push/receipt'

import { createZapoClient } from './helpers/zapo-client'

test('fake server pushes a read receipt and the lib emits message_receipt', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'receipts-inbound' })

    const peerJid = '5511777777777@s.whatsapp.net'
    const messageId = 'wa-msg-id-12345'

    const receiptPromise = new Promise<{
        readonly stanzaId?: string
        readonly chatJid?: string
        readonly stanzaType?: string
    }>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for message_receipt')),
            5_000
        )
        client.once('message_receipt', (event) => {
            clearTimeout(timer)
            resolve({
                stanzaId: event.stanzaId,
                chatJid: event.chatJid,
                stanzaType: event.stanzaType
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
        assert.equal(event.stanzaType, 'read')
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

        const stanzaPromise = server.expectStanza(
            { tag: 'receipt' },
            { timeoutMs: 5_000 }
        )

        await client.sendReceipt({
            to: peerJid,
            id: messageId,
            type: 'read'
        })

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
