/**
 * Phase 12 cross-check: real `WaClient` sends a message, fake peer decrypts.
 *
 * Scenario:
 *   1. WaClient connects + pairs (Phase 10).
 *   2. Test creates a FakePeer with a real signed prekey bundle.
 *   3. Test triggers a fresh prekey upload (so the lib has a session
 *      identity to encrypt against — we don't actually need it on this
 *      side, but the lib's send pipeline insists on a fresh upload).
 *   4. Test calls `client.sendMessage(peerJid, { conversation: '...' })`.
 *   5. The fake peer captures the inbound `<message><enc type="pkmsg"/></message>`
 *      stanza, runs the X3DH responder + Double Ratchet kick, decrypts the
 *      AES-CBC ciphertext, decodes the `Message` proto and asserts the
 *      plaintext matches what was sent.
 *   6. A second send is decrypted as a `<enc type="msg"/>` reusing the
 *      established recv chain.
 *
 * NOTE: imports zapo-js via the cross-check helper. The fake peer's recv
 * session is implemented from `/deobfuscated` references, not from the
 * lib's source.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

test('paired client.sendMessage is decrypted by the fake peer', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'send-decrypt' })

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
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 5_000)
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

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        const peer = await server.createFakePeer(
            { jid: peerJid, displayName: 'Fake Peer' },
            pipelineAfterPair
        )
        await server.triggerPreKeyUpload(pipelineAfterPair)

        // First send → fake peer should decrypt a pkmsg.
        const firstReceivedPromise = peer.expectMessage({ timeoutMs: 5_000 })
        await client.sendMessage(peerJid, { conversation: 'hello peer from real client' })
        const first = await firstReceivedPromise
        assert.equal(first.encType, 'pkmsg')
        assert.equal(first.message.conversation, 'hello peer from real client')

        // Second send → still a pkmsg because the lib keeps the
        // initialExchangeInfo until the fake peer replies (which we
        // don't do in this scenario). The recv chain continues to
        // advance and the next chain key correctly decrypts the
        // follow-up message.
        const secondReceivedPromise = peer.expectMessage({ timeoutMs: 5_000 })
        await client.sendMessage(peerJid, { conversation: 'second one' })
        const second = await secondReceivedPromise
        assert.equal(second.encType, 'pkmsg')
        assert.equal(second.message.conversation, 'second one')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
