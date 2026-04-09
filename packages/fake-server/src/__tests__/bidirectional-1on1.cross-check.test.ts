/**
 * Phase 31 cross-check: bidirectional 1:1 ping-pong with the lib.
 *
 * This is the 100% coverage scenario for 1:1 send/recv:
 *   1. Fake peer (Alice X3DH initiator) sends pkmsg1 → lib decrypts.
 *   2. Lib replies with msg1 (its first reply, lib has done a recv DR
 *      step + a send DR step) → fake peer decrypts via the recv DR
 *      step (`runRecvRatchetStep`) using its own sendRatchet priv key.
 *   3. Fake peer sends msg2 → lib decrypts (after the recv DR rotation
 *      forced an outbound rotation, fake peer has a fresh send chain).
 *   4. Lib replies with msg2 → fake peer decrypts (another DR step).
 *   5. Fake peer sends msg3 → lib decrypts.
 *
 * Each direction goes through the lib's REAL Signal layer end-to-end;
 * the fake peer's `FakePeerDoubleRatchet` mirrors the lib's full DR
 * algorithm so every ratchet rotation lines up byte-for-byte.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

function waitForMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs = 8_000
): Promise<Parameters<WaClientEventMap['message']>[0]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for matching message')),
            timeoutMs
        )
        const listener: WaClientEventMap['message'] = (event) => {
            if (predicate(event)) {
                clearTimeout(timer)
                client.off('message', listener)
                resolve(event)
            }
        }
        client.on('message', listener)
    })
}

test('bidirectional 1:1 ping-pong (peer\u2192client\u2192peer\u2192client\u2192peer) decrypts on both sides', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'bidi-1on1' })

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

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        const peer = await server.createFakePeer({ jid: peerJid }, pipelineAfterPair)
        await server.triggerPreKeyUpload(pipelineAfterPair)

        // === Round 1: peer → client (Alice X3DH initiator) ===
        const round1ReceivedByLib = waitForMessage(
            client,
            (event) => event.message?.conversation === 'peer-to-client #1'
        )
        await peer.sendConversation('peer-to-client #1')
        const round1Event = await round1ReceivedByLib
        assert.equal(round1Event.message?.conversation, 'peer-to-client #1')

        // === Round 2: client → peer (lib's first reply, contains lib's NEW
        // sendRatchet pub; fake peer must run a recv DR step to decrypt) ===
        const round2ReceivedByPeer = peer.expectMessage({ timeoutMs: 8_000 })
        await client.sendMessage(peerJid, { conversation: 'client-to-peer #1' })
        const round2 = await round2ReceivedByPeer
        assert.equal(round2.message.conversation, 'client-to-peer #1')

        // === Round 3: peer → client (after recv DR step, fake peer has a
        // brand-new send ratchet — this is a fresh chain, so the lib must
        // also run a recv DR step to decrypt) ===
        const round3ReceivedByLib = waitForMessage(
            client,
            (event) => event.message?.conversation === 'peer-to-client #2'
        )
        await peer.sendConversation('peer-to-client #2')
        const round3Event = await round3ReceivedByLib
        assert.equal(round3Event.message?.conversation, 'peer-to-client #2')

        // === Round 4: client → peer (lib does another DR rotation) ===
        const round4ReceivedByPeer = peer.expectMessage({ timeoutMs: 8_000 })
        await client.sendMessage(peerJid, { conversation: 'client-to-peer #2' })
        const round4 = await round4ReceivedByPeer
        assert.equal(round4.message.conversation, 'client-to-peer #2')

        // === Round 5: peer → client (third send after two recv rotations) ===
        const round5ReceivedByLib = waitForMessage(
            client,
            (event) => event.message?.conversation === 'peer-to-client #3'
        )
        await peer.sendConversation('peer-to-client #3')
        const round5Event = await round5ReceivedByLib
        assert.equal(round5Event.message?.conversation, 'peer-to-client #3')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('bidirectional 1:1 starting with the lib (client\u2192peer\u2192client\u2192peer)', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'bidi-bob-first' })

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

    const peerJid = '5511666666666@s.whatsapp.net'

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

        // === Round 1: client → peer FIRST (lib X3DH initiator, Bob role) ===
        const round1Promise = peer.expectMessage({ timeoutMs: 8_000 })
        await client.sendMessage(peerJid, { conversation: 'lib first #1' })
        const round1 = await round1Promise
        assert.equal(round1.message.conversation, 'lib first #1')
        assert.equal(round1.encType, 'pkmsg')

        // === Round 2: peer → client (fake peer's first send after Bob bootstrap) ===
        const round2Promise = waitForMessage(
            client,
            (event) => event.message?.conversation === 'peer reply #1'
        )
        await peer.sendConversation('peer reply #1')
        const round2 = await round2Promise
        assert.equal(round2.message?.conversation, 'peer reply #1')

        // === Round 3: client → peer again ===
        const round3Promise = peer.expectMessage({ timeoutMs: 8_000 })
        await client.sendMessage(peerJid, { conversation: 'lib reply #2' })
        const round3 = await round3Promise
        assert.equal(round3.message.conversation, 'lib reply #2')

        // === Round 4: peer → client again ===
        const round4Promise = waitForMessage(
            client,
            (event) => event.message?.conversation === 'peer reply #2'
        )
        await peer.sendConversation('peer reply #2')
        const round4 = await round4Promise
        assert.equal(round4.message?.conversation, 'peer reply #2')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
