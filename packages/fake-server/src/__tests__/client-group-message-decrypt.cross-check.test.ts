import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

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
        const timer = setTimeout(() => reject(new Error('auth_paired timeout')), 60_000)
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
        await server.runPairing(pipeline, { deviceJid: meDeviceJid }, () => materialPromise)

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        const peer = await server.createFakePeer(
            { jid: peerJid, displayName: 'Group Peer' },
            pipelineAfterPair
        )
        server.createFakeGroup({
            groupJid,
            subject: 'Fake Group',
            participants: [peer]
        })
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
