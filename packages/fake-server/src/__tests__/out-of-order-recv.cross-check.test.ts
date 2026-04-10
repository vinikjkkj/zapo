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

        const r0 = await peer.decryptStanza(stanzas[0])
        assert.ok(r0)
        assert.equal(r0.message.conversation, messages[0])

        const r2 = await peer.decryptStanza(stanzas[2])
        assert.ok(r2)
        assert.equal(r2.message.conversation, messages[2])

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
