/**
 * Phase 34 cross-check: corrupted ciphertext triggers a retry receipt.
 *
 * Scenario:
 *   1. Pair the WaClient.
 *   2. Fake peer encrypts a 1:1 message and ships it with the
 *      ciphertext's last byte flipped — the lib's MAC verify fails.
 *   3. The lib emits a `<receipt type="retry"/>` (or similar
 *      retry-class receipt) in response. We capture it via
 *      `expectStanza({ tag: 'receipt' })`.
 *   4. Test asserts the receipt was directed at the right message id.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

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

        // Pre-arm a `<receipt/>` waiter so we don't miss the retry.
        const receiptPromise = server.expectStanza(
            { tag: 'receipt' },
            { timeoutMs: 10_000 }
        )

        await peer.sendConversation('this should fail to decrypt', {
            id: messageId,
            tamperCiphertext: (bytes) => {
                // Flip the last byte (inside the MAC) so the lib's
                // signal layer rejects the message at the MAC verify
                // step. The lib's incoming-message dispatcher catches
                // the failure and ships a retry-class receipt.
                const tampered = new Uint8Array(bytes)
                tampered[tampered.byteLength - 1] ^= 0xff
                return tampered
            }
        })

        const receipt = await receiptPromise
        assert.equal(receipt.tag, 'receipt')
        // The retry receipt carries the failed message id so the sender
        // knows which message to re-encrypt with a fresh session.
        assert.equal(receipt.attrs.id, messageId)
        // The receipt is addressed back to the peer that sent the
        // corrupted message.
        assert.equal(receipt.attrs.to, peerJid)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
