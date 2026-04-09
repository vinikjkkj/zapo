/**
 * Phase 11 cross-check: paired client.sendMessage end-to-end.
 *
 * Scenario:
 *   1. Real WaClient connects (Noise XX → success).
 *   2. Server drives the QR-pairing flow (Phase 10).
 *   3. Lib emits `auth_paired` with a populated `meJid`. The lib also
 *      reconnects internally (logged "pairing completed, restarting
 *      comms as registered") so a second pipeline appears.
 *   4. Test creates a `FakePeer` with a real, signed prekey bundle and
 *      registers IQ handlers for `usync` (devices) and `<key_fetch>`
 *      (prekey bundle).
 *   5. Test calls `client.sendMessage('peer-jid', { extendedTextMessage })`.
 *   6. The lib resolves the peer's devices via usync, fetches the
 *      prekey bundle, runs X3DH, encrypts and pushes a `<message>`
 *      stanza targeting the peer.
 *   7. Test asserts the captured stanza shape (it does NOT decrypt — the
 *      fake peer's recv chain is out of scope here).
 *
 * NOTE: this file is allowed to import zapo-js directly because it is a
 * cross-check test that drives the lib end-to-end.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

function findEncSomewhere(node: BinaryNode): BinaryNode | null {
    if (node.tag === 'enc') return node
    if (!Array.isArray(node.content)) return null
    for (const child of node.content) {
        const found = findEncSomewhere(child)
        if (found) return found
    }
    return null
}

test('paired client.sendMessage reaches the wire as a real <message> stanza', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'send-message' })

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

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()

        await server.runPairing(
            pipeline,
            { deviceJid: '5511999999999:1@s.whatsapp.net' },
            () => materialPromise
        )

        // After pairing the lib reconnects with credentials. Wait for the
        // NEW authenticated pipeline (the original one from the
        // pre-registration session is about to close).
        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        // Create the fake peer (auto-registers usync + prekey-fetch handlers).
        await server.createFakePeer({ jid: peerJid, displayName: 'Fake Peer' }, pipelineAfterPair)

        // The lib needs the prekey upload to complete before it considers
        // itself ready to send. Trigger it.
        await server.triggerPreKeyUpload(pipelineAfterPair)

        // Now send a message — the lib will:
        //   * resolve peer devices via usync
        //   * fetch peer prekey bundle via <key_fetch>
        //   * encrypt + send <message><enc type="pkmsg"/></message>
        const messagePromise = server.expectStanza(
            { tag: 'message', to: peerJid },
            { timeoutMs: 5_000 }
        )

        await client.sendMessage(peerJid, {
            extendedTextMessage: { text: 'hello peer from real client' }
        })

        const stanza = await messagePromise
        assert.equal(stanza.tag, 'message')
        assert.equal(stanza.attrs.to, peerJid)
        // Confirm the stanza tree contains at least one encrypted <enc>
        // child somewhere — the actual position depends on the lib's
        // fanout shape (direct vs participants wrapper).
        const enc = findEncSomewhere(stanza)
        assert.ok(enc, 'message stanza should contain an <enc> child')
        assert.ok(
            enc.attrs.type === 'pkmsg' || enc.attrs.type === 'msg',
            `enc should be pkmsg or msg, got ${enc.attrs.type}`
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
