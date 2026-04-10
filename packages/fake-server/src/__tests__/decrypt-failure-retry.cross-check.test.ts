import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

test('corrupted ciphertext from fake peer triggers a retry receipt from the lib', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'decrypt-failure-retry' })
    const peerJid = '5511777777777@s.whatsapp.net'
    const messageId = 'corrupted-msg-id'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: peerJid }, pipeline)

        const receiptPromise = server.expectStanza(
            { tag: 'receipt' },
            { timeoutMs: 10_000 }
        )

        await peer.sendConversation('this should fail to decrypt', {
            id: messageId,
            tamperCiphertext: (bytes) => {
                const tampered = new Uint8Array(bytes)
                tampered[tampered.byteLength - 1] ^= 0xff
                return tampered
            }
        })

        const receipt = await receiptPromise
        assert.equal(receipt.tag, 'receipt')
        assert.equal(receipt.attrs.id, messageId)
        assert.equal(receipt.attrs.to, peerJid)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
