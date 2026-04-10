/** Cross-check: paired client.sendMessage reaches the wire as encrypted `<message/>`. */

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

        const pipelineAfterPairPromise = server.waitForNextAuthenticatedPipeline()
        await pairedPromise
        const pipelineAfterPair = await pipelineAfterPairPromise

        await server.createFakePeer({ jid: peerJid, displayName: 'Fake Peer' }, pipelineAfterPair)

        await server.triggerPreKeyUpload(pipelineAfterPair)

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
