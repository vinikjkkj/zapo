import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

test('paired client.sendMessage to a 3-participant group fans out via the registries', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'multi-participant-group' })

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

    const groupJid = '120363555555555555@g.us'
    const meJid = '5511999999999@s.whatsapp.net'
    const text = 'hello three-peer group'

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

        const peerA = await server.createFakePeer(
            { jid: '5511aaa1111@s.whatsapp.net', displayName: 'Alice' },
            pipelineAfterPair
        )
        const peerB = await server.createFakePeer(
            { jid: '5511bbb2222@s.whatsapp.net', displayName: 'Bob' },
            pipelineAfterPair
        )
        const peerC = await server.createFakePeer(
            { jid: '5511ccc3333@s.whatsapp.net', displayName: 'Carol' },
            pipelineAfterPair
        )

        server.createFakeGroup({
            groupJid,
            subject: 'Three-Peer Test Group',
            participants: [peerA, peerB, peerC]
        })

        await server.triggerPreKeyUpload(pipelineAfterPair)

        const stanzaPromise = server.expectStanza(
            { tag: 'message', to: groupJid },
            { timeoutMs: 15_000 }
        )

        const decryptA = peerA.expectGroupMessage(groupJid, {
            timeoutMs: 15_000,
            senderJid: meJid
        })
        const decryptB = peerB.expectGroupMessage(groupJid, {
            timeoutMs: 15_000,
            senderJid: meJid
        })
        const decryptC = peerC.expectGroupMessage(groupJid, {
            timeoutMs: 15_000,
            senderJid: meJid
        })

        await client.sendMessage(groupJid, { conversation: text })

        const stanza = await stanzaPromise
        const children: readonly BinaryNode[] = Array.isArray(stanza.content)
            ? stanza.content
            : []
        const participantsNode = children.find((child) => child.tag === 'participants')
        assert.ok(participantsNode, 'fanout stanza should carry a <participants> wrapper')
        const participantsContent: readonly BinaryNode[] = Array.isArray(
            participantsNode.content
        )
            ? participantsNode.content
            : []
        const toNodes = participantsContent.filter((child) => child.tag === 'to')
        assert.equal(
            toNodes.length,
            3,
            `fanout should target all 3 peers, got ${toNodes.length}`
        )
        const toJids = new Set(toNodes.map((node) => node.attrs.jid))
        assert.ok(toJids.has(peerA.jid), `missing fanout to ${peerA.jid}`)
        assert.ok(toJids.has(peerB.jid), `missing fanout to ${peerB.jid}`)
        assert.ok(toJids.has(peerC.jid), `missing fanout to ${peerC.jid}`)

        const skmsgNode = children.find(
            (child) => child.tag === 'enc' && child.attrs.type === 'skmsg'
        )
        assert.ok(skmsgNode, 'fanout stanza should carry a top-level <enc type=skmsg>')

        const [recvA, recvB, recvC] = await Promise.all([decryptA, decryptB, decryptC])
        assert.equal(recvA.encType, 'skmsg')
        assert.equal(recvB.encType, 'skmsg')
        assert.equal(recvC.encType, 'skmsg')
        assert.equal(recvA.message.conversation, text)
        assert.equal(recvB.message.conversation, text)
        assert.equal(recvC.message.conversation, text)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
