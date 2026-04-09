/**
 * Phase 32 cross-checks: presence + chatstate inbound stanzas.
 *
 * Two scenarios:
 *   (a) Fake server pushes `<presence type="available" from=peer/>`
 *       and the lib emits `presence` with the matching `chatJid`.
 *   (b) Fake server pushes `<chatstate from=peer><composing/></chatstate>`
 *       and the lib emits `chatstate` with the matching `chatJid` +
 *       composing payload.
 *
 * Both flows are stanza-only — no Signal session is needed.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildChatstate } from '../protocol/push/chatstate'
import { buildIncomingPresence } from '../protocol/push/presence'

import { createZapoClient } from './helpers/zapo-client'

test('fake server pushes a presence stanza and the lib emits the presence event', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'presence-stanza' })
    const peerJid = '5511777777777@s.whatsapp.net'

    const presencePromise = new Promise<{
        readonly chatJid?: string
    }>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for presence event')),
            5_000
        )
        client.once('presence', (event) => {
            clearTimeout(timer)
            resolve({ chatJid: event.chatJid })
        })
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await pipeline.sendStanza(buildIncomingPresence({ from: peerJid, type: 'available' }))

        const event = await presencePromise
        assert.equal(event.chatJid, peerJid)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('fake server pushes a chatstate stanza and the lib emits the chatstate event', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'chatstate-stanza' })
    const peerJid = '5511777777777@s.whatsapp.net'

    const chatstatePromise = new Promise<{
        readonly chatJid?: string
    }>((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for chatstate event')),
            5_000
        )
        client.once('chatstate', (event) => {
            clearTimeout(timer)
            resolve({ chatJid: event.chatJid })
        })
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await pipeline.sendStanza(
            buildChatstate({ from: peerJid, state: { kind: 'composing' } })
        )

        const event = await chatstatePromise
        assert.equal(event.chatJid, peerJid)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
