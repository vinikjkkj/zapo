/**
 * Phase 15 cross-check: real `WaClient` sends a group message,
 * fake peer decrypts the SenderKey ciphertext.
 *
 * Scenario:
 *   1. WaClient connects + pairs.
 *   2. Test creates a FakePeer with a real signed prekey bundle and
 *      registers it as the only participant of a fake group.
 *   3. Test registers an inline `<iq xmlns=w:g2 type=get>` handler
 *      replying with a minimal `<group/>` metadata node listing the
 *      fake peer as the single participant.
 *   4. Test triggers a fresh prekey upload.
 *   5. Test calls `client.sendMessage(groupJid, { conversation })`.
 *   6. The lib resolves the group metadata, fans out, runs X3DH for the
 *      peer (one-time pkmsg carrying the SKDM), encrypts the actual
 *      group payload as `<enc type="skmsg"/>` and pushes a single
 *      `<message to=group-jid>` stanza.
 *   7. The fake peer captures the stanza, decrypts the bootstrap pkmsg
 *      via the 1:1 recv session (extracting the SKDM), then decrypts
 *      the skmsg via the group recv session and asserts the plaintext.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'
import { buildIqResult } from '../protocol/iq/router'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

function buildGroupMetadataResult(iq: BinaryNode, groupJid: string, participantJid: string): BinaryNode {
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
                    subject: 'Fake Group',
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

test('paired client.sendMessage to a group is decrypted by the fake peer', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'send-group-decrypt' })

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
    const groupJid = '120363000000000001@g.us'
    const meDeviceJid = '5511999999999:1@s.whatsapp.net'
    const meJid = '5511999999999@s.whatsapp.net'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.runPairing(
            pipeline,
            { deviceJid: meDeviceJid },
            () => materialPromise
        )

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        // Register the group metadata IQ handler BEFORE creating the peer,
        // so the lib's `queryGroupMetadata` resolves it.
        server.registerIqHandler(
            { xmlns: 'w:g2', type: 'get', childTag: 'query' },
            (iq) => buildGroupMetadataResult(iq, groupJid, peerJid),
            `group-metadata:${groupJid}`
        )

        const peer = await server.createFakePeer(
            { jid: peerJid, displayName: 'Group Peer' },
            pipelineAfterPair
        )
        await server.triggerPreKeyUpload(pipelineAfterPair)

        const groupReceivedPromise = peer.expectGroupMessage(groupJid, {
            timeoutMs: 8_000,
            senderJid: meJid
        })
        await client.sendMessage(groupJid, { conversation: 'hello group from real client' })
        const received = await groupReceivedPromise
        assert.equal(received.encType, 'skmsg')
        assert.equal(received.message.conversation, 'hello group from real client')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
