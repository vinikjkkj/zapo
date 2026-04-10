/** Cross-check: bidirectional group ping-pong decrypts on both sides. */

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

        const peer = await server.createFakePeer({ jid: peerJid }, pipelineAfterPair)
        server.createFakeGroup({
            groupJid,
            subject: 'Bidi Group',
            participants: [peer]
        })
        await server.triggerPreKeyUpload(pipelineAfterPair)

        const round1ReceivedByLib = waitForMessage(
            client,
            (event) => event.chatJid === groupJid && event.message?.conversation === 'peer-group #1'
        )
        await peer.sendGroupConversation(groupJid, 'peer-group #1')
        const round1 = await round1ReceivedByLib
        assert.equal(round1.chatJid, groupJid)
        assert.equal(round1.senderJid, peerJid)
        assert.equal(round1.isGroupChat, true)
        assert.equal(round1.message?.conversation, 'peer-group #1')

        const round2Promise = peer.expectGroupMessage(groupJid, {
            timeoutMs: 8_000,
            senderJid: meJid
        })
        await client.sendMessage(groupJid, { conversation: 'lib-group #1' })
        const round2 = await round2Promise
        assert.equal(round2.encType, 'skmsg')
        assert.equal(round2.message.conversation, 'lib-group #1')

        const round3ReceivedByLib = waitForMessage(
            client,
            (event) => event.chatJid === groupJid && event.message?.conversation === 'peer-group #2'
        )
        await peer.sendGroupConversation(groupJid, 'peer-group #2')
        const round3 = await round3ReceivedByLib
        assert.equal(round3.message?.conversation, 'peer-group #2')

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
