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

        const peer = await server.createFakePeer(
            { jid: peerJid, displayName: 'Fake Peer' },
            pipelineAfterPair
        )
        await server.triggerPreKeyUpload(pipelineAfterPair)

        const firstReceivedPromise = peer.expectMessage({ timeoutMs: 5_000 })
        await client.sendMessage(peerJid, { conversation: 'hello peer from real client' })
        const first = await firstReceivedPromise
        assert.equal(first.encType, 'pkmsg')
        assert.equal(first.message.conversation, 'hello peer from real client')

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
