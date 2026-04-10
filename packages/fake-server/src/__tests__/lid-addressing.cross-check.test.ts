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

const lidJid = '5511777777777@lid'

test('fake peer in @lid space pushes a Signal message and the lib emits message', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'lid-inbound' })
    const inboundText = 'hello from lid space'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: lidJid }, pipeline)

        const inboundPromise = waitForMessage(
            client,
            (event) => event.message?.conversation === inboundText
        )
        await peer.sendConversation(inboundText)
        const inbound = await inboundPromise
        assert.equal(inbound.message?.conversation, inboundText)
        assert.ok(
            inbound.senderJid?.includes('@lid'),
            `senderJid should be @lid, got ${inbound.senderJid}`
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('paired client.sendMessage to a @lid peer is decrypted by the fake peer', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'lid-outbound' })
    const outboundText = 'outbound to lid space'

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

        const peer = await server.createFakePeer({ jid: lidJid }, pipelineAfterPair)
        await server.triggerPreKeyUpload(pipelineAfterPair)

        const decryptedPromise = peer.expectMessage({ timeoutMs: 8_000 })
        await client.sendMessage(lidJid, { conversation: outboundText })
        const decrypted = await decryptedPromise
        assert.equal(decrypted.message.conversation, outboundText)
        assert.equal(decrypted.encType, 'pkmsg')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
