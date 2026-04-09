/**
 * Phase 32 cross-check: bidirectional 1:N (group) ping-pong.
 *
 * Drives both directions of group messaging through the lib's real
 * SenderKey + Signal layer:
 *   1. Fake peer sends a group conversation (bootstraps the SKDM via
 *      a pkmsg + ships the actual content as skmsg). The lib decrypts
 *      and emits `message` with `chatJid=group`.
 *   2. Lib sends a group message back. The fake peer's
 *      `expectGroupMessage` walks the per-recipient pkmsg in
 *      `<participants>`, extracts the lib's SKDM via the now-mature
 *      Signal session, then decrypts the top-level skmsg via the
 *      `FakePeerGroupRecvSession`.
 *   3. Fake peer sends ANOTHER group message in the same group (the
 *      SenderKey chain advances; no new SKDM bootstrap).
 *   4. Lib sends ANOTHER group message back. Same fanout shape, fake
 *      peer decrypts via the cached recv senderkey.
 *
 * Combined with the bidirectional 1:1 cross-check, this covers the
 * "100% 1:1 + 1:N" send/recv matrix the user asked for.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'
import { buildIqResult } from '../protocol/iq/router'
import type { BinaryNode } from '../transport/codec'

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

function buildGroupMetadataResult(
    iq: BinaryNode,
    groupJid: string,
    participantJid: string
): BinaryNode {
    const result = buildIqResult(iq)
    return {
        ...result,
        content: [
            {
                tag: 'group',
                attrs: {
                    id: groupJid,
                    creation: String(Math.floor(Date.now() / 1_000)),
                    creator: participantJid,
                    subject: 'Bidi Group',
                    s_t: String(Math.floor(Date.now() / 1_000)),
                    s_o: participantJid
                },
                content: [
                    {
                        tag: 'participant',
                        attrs: { jid: participantJid }
                    }
                ]
            }
        ]
    }
}

test('bidirectional group ping-pong (peer\u2192client\u2192peer\u2192client) decrypts on both sides', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'bidi-group' })

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
    const groupJid = '120363111111111111@g.us'
    const meJid = '5511999999999@s.whatsapp.net'

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

        // Group metadata IQ handler — needed for the lib's outbound
        // group send to resolve participants.
        server.registerIqHandler(
            { xmlns: 'w:g2', type: 'get', childTag: 'query' },
            (iq) => buildGroupMetadataResult(iq, groupJid, peerJid),
            'group-metadata'
        )

        const peer = await server.createFakePeer({ jid: peerJid }, pipelineAfterPair)
        await server.triggerPreKeyUpload(pipelineAfterPair)

        // === Round 1: peer → client (fake peer sends group conversation) ===
        const round1ReceivedByLib = waitForMessage(
            client,
            (event) =>
                event.chatJid === groupJid && event.message?.conversation === 'peer-group #1'
        )
        await peer.sendGroupConversation(groupJid, 'peer-group #1')
        const round1 = await round1ReceivedByLib
        assert.equal(round1.chatJid, groupJid)
        assert.equal(round1.senderJid, peerJid)
        assert.equal(round1.isGroupChat, true)
        assert.equal(round1.message?.conversation, 'peer-group #1')

        // === Round 2: client → peer (lib sends to group; fake peer decrypts
        // via 1:1 bootstrap pkmsg → SKDM → skmsg) ===
        const round2Promise = peer.expectGroupMessage(groupJid, {
            timeoutMs: 8_000,
            senderJid: meJid
        })
        await client.sendMessage(groupJid, { conversation: 'lib-group #1' })
        const round2 = await round2Promise
        assert.equal(round2.encType, 'skmsg')
        assert.equal(round2.message.conversation, 'lib-group #1')

        // === Round 3: peer → client AGAIN (SenderKey chain walks forward,
        // no new SKDM needed since the lib already has the peer's
        // sender key state from round 1) ===
        const round3ReceivedByLib = waitForMessage(
            client,
            (event) =>
                event.chatJid === groupJid && event.message?.conversation === 'peer-group #2'
        )
        await peer.sendGroupConversation(groupJid, 'peer-group #2')
        const round3 = await round3ReceivedByLib
        assert.equal(round3.message?.conversation, 'peer-group #2')

        // === Round 4: client → peer AGAIN (lib's SKDM was already cached
        // by the peer in round 2 — this round walks the recv senderkey
        // chain forward without re-bootstrapping) ===
        const round4Promise = peer.expectGroupMessage(groupJid, {
            timeoutMs: 8_000,
            senderJid: meJid
        })
        await client.sendMessage(groupJid, { conversation: 'lib-group #2' })
        const round4 = await round4Promise
        assert.equal(round4.encType, 'skmsg')
        assert.equal(round4.message.conversation, 'lib-group #2')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
