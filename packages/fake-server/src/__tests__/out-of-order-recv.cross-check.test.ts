/**
 * Phase 33 cross-check: out-of-order Double Ratchet recv.
 *
 * Scenario:
 *   1. Pair the WaClient.
 *   2. Subscribe to the lib's outbound `<message>` stanzas via
 *      `expectStanza` so the test can collect them WITHOUT routing
 *      them through `FakePeer.expectMessage` (which would consume
 *      them in arrival order).
 *   3. Call `client.sendMessage(peer, ...)` four times in a row,
 *      capturing the four `<message>` stanzas.
 *   4. Hand them to the fake peer in scrambled order
 *      (counter 0, 2, 1, 3) — this exercises the recv chain's
 *      out-of-order path: counter 0 walks the chain, counter 2 walks
 *      forward and stashes counter 1's key into `unusedKeys`,
 *      counter 1 then resolves from the stash, and counter 3 walks
 *      the chain forward again.
 *   5. Assert each decrypted plaintext matches the right input.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

test('fake peer decrypts out-of-order msgs (counter 0,2,1,3) via the unused-keys cache', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'out-of-order-recv' })

    const materialPromise = new Promise<{
        readonly advSecretKey: Uint8Array
        readonly identityPublicKey: Uint8Array
    }>((resolve) => {
        client.once('auth_qr', (event: Parameters<WaClientEventMap['auth_qr']>[0]) => {
            const parsed = parsePairingQrString(event.qr)
            resolve({
                advSecretKey: parsed.advSecretKey,
                identityPublicKey: parsed.identityPublicKey
            })
        })
    })
    const pairedPromise = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
        client.once('auth_paired', () => {
            clearTimeout(timer)
            resolve()
        })
    })

    const peerJid = '5511777777777@s.whatsapp.net'
    const messages = [
        'out-of-order #0',
        'out-of-order #1',
        'out-of-order #2',
        'out-of-order #3'
    ]

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.runPairing(
            pipeline,
            { deviceJid: '5511999999999:1@s.whatsapp.net' },
            () => materialPromise
        )

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        const peer = await server.createFakePeer({ jid: peerJid }, pipelineAfterPair)
        await server.triggerPreKeyUpload(pipelineAfterPair)

        // Pre-arm `expectStanza` for the four outbound messages BEFORE
        // calling `sendMessage`, so we don't miss any. Each call resolves
        // with the next captured `<message to=peer-jid>` stanza.
        const stanzaPromises = [
            server.expectStanza({ tag: 'message', to: peerJid }, { timeoutMs: 8_000 }),
            server.expectStanza({ tag: 'message', to: peerJid }, { timeoutMs: 8_000 }),
            server.expectStanza({ tag: 'message', to: peerJid }, { timeoutMs: 8_000 }),
            server.expectStanza({ tag: 'message', to: peerJid }, { timeoutMs: 8_000 })
        ]
        for (const text of messages) {
            await client.sendMessage(peerJid, { conversation: text })
        }
        const stanzas = await Promise.all(stanzaPromises)
        assert.equal(stanzas.length, 4)

        // Decrypt in scrambled order: 0, 2, 1, 3.
        const r0 = await peer.decryptStanza(stanzas[0])
        assert.ok(r0)
        assert.equal(r0.message.conversation, messages[0])

        const r2 = await peer.decryptStanza(stanzas[2])
        assert.ok(r2)
        assert.equal(r2.message.conversation, messages[2])

        // counter 1 must come out of the unused-keys cache.
        const r1 = await peer.decryptStanza(stanzas[1])
        assert.ok(r1)
        assert.equal(r1.message.conversation, messages[1])

        const r3 = await peer.decryptStanza(stanzas[3])
        assert.ok(r3)
        assert.equal(r3.message.conversation, messages[3])
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
