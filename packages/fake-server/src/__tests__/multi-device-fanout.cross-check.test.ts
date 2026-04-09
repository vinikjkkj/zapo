/**
 * Phase 24 cross-check: multi-device fanout end-to-end.
 *
 * Scenario:
 *   1. Real WaClient connects + completes the noise handshake.
 *   2. Test creates a peer GROUP under a single user JID with two
 *      device ids (`0` and `1`). Each device is its own `FakePeer`
 *      with an independent Signal identity + prekey bundle. The
 *      group registers a single shared usync handler returning both
 *      device ids and a single shared prekey-fetch handler that
 *      parses the inbound `<key><user jid="...">` children and
 *      ships one bundle per requested device JID.
 *   3. Test triggers a fresh prekey upload + calls
 *      `client.sendMessage(userJid, { conversation })`.
 *   4. The lib resolves the peer via usync (gets back two devices),
 *      runs `fetchKeyBundles` for both device JIDs, runs X3DH twice,
 *      and pushes a single `<message><participants>` stanza with one
 *      `<to jid=user:N>...<enc/></to>` child per device.
 *   5. Each FakePeer's `expectMessage` resolves with the same
 *      decrypted plaintext.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'
import type { BinaryNode } from '../transport/codec'

import { createZapoClient } from './helpers/zapo-client'

test('paired client.sendMessage fans out to all devices of a multi-device peer', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'multi-device-fanout' })

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

    const userJid = '5511777777777@s.whatsapp.net'
    const expectedText = 'multi-device hello'

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

        const peers = await server.createFakePeerGroup(
            { userJid, deviceIds: [0, 1], displayName: 'Multi Device' },
            pipelineAfterPair
        )
        assert.equal(peers.length, 2)
        await server.triggerPreKeyUpload(pipelineAfterPair)

        // Capture the outbound <message> stanza so we can confirm the
        // lib actually fanned out to both devices via <participants>.
        const stanzaPromise = server.expectStanza({ tag: 'message' }, { timeoutMs: 8_000 })
        const device0Promise = peers[0].expectMessage({ timeoutMs: 8_000 })
        const device1Promise = peers[1].expectMessage({ timeoutMs: 8_000 })

        await client.sendMessage(userJid, { conversation: expectedText })

        const stanza = await stanzaPromise
        assert.equal(stanza.tag, 'message')
        // The lib's fanout produces a <participants> wrapper with one
        // <to jid=device-jid> per recipient device.
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
            2,
            `fanout should target both devices, got ${toNodes.length}`
        )
        const toJids = new Set(toNodes.map((node: BinaryNode) => node.attrs.jid))
        assert.ok(toJids.has(peers[0].jid), `missing <to jid=${peers[0].jid}>`)
        assert.ok(toJids.has(peers[1].jid), `missing <to jid=${peers[1].jid}>`)

        // Each device decrypts the same plaintext via its own session.
        const [received0, received1] = await Promise.all([device0Promise, device1Promise])
        assert.equal(received0.message.conversation, expectedText)
        assert.equal(received1.message.conversation, expectedText)
        assert.equal(received0.encType, 'pkmsg')
        assert.equal(received1.encType, 'pkmsg')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
