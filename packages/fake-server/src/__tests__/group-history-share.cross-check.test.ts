/** Cross-check: sharing group history uploads a bundle and fans it out only to its receivers. */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { parsePairingQrString } from '../protocol/auth/pair-device'

import { createZapoClient } from './helpers/zapo-client'

const GROUP_JID = '120363000000000000@g.us'
const ALICE = '5511777777777@s.whatsapp.net'
const BOB = '5511666666666@s.whatsapp.net'
const ME_DEVICE = '5511999999999:1@s.whatsapp.net'
const ME_USER = '5511999999999@s.whatsapp.net'
/** `group_history_send` - WhatsApp gates the sender side on it per account. */
const GROUP_HISTORY_SEND_CONFIG_CODE = 15313

/** User JIDs the `<participants>` children of a fanout stanza are addressed to. */
function fanoutUserJids(stanza: BinaryNode): readonly string[] {
    const content = Array.isArray(stanza.content) ? stanza.content : []
    const participants = content.find((child) => child.tag === 'participants')
    const children = Array.isArray(participants?.content) ? participants.content : []
    const users = new Set<string>()
    for (const child of children) {
        const jid = child.attrs.jid
        if (typeof jid === 'string') {
            users.add(jid.split(':')[0].split('@')[0])
        }
    }
    return [...users]
}

test('shareGroupHistory uploads a bundle and addresses only the chosen members', async () => {
    const server = await FakeWaServer.start()
    server.setAbProps({
        props: [{ configCode: GROUP_HISTORY_SEND_CONFIG_CODE, configValue: 'true' }]
    })
    const { client } = createZapoClient(server, { sessionId: 'group-history-share' })

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
        await server.runPairing(pipeline, { deviceJid: ME_DEVICE }, () => materialPromise)

        await pairedPromise
        const paired = await server
            .waitForNextAuthenticatedPipeline(5_000)
            .catch(() => server.waitForAuthenticatedPipeline())

        const alice = await server.createFakePeer({ jid: ALICE }, paired)
        const bob = await server.createFakePeer({ jid: BOB }, paired)
        await server.triggerPreKeyUpload(paired)
        server.createFakeGroup({
            groupJid: GROUP_JID,
            subject: 'history share',
            participants: [alice, bob],
            creator: ME_USER
        })

        const bundlePromise = server.expectStanza(
            { tag: 'message', to: GROUP_JID },
            { timeoutMs: 15_000 }
        )

        const result = await client.message.shareGroupHistory(GROUP_JID, {
            toJids: [ALICE],
            messages: [
                {
                    key: { id: 'HIST-1', remoteJid: GROUP_JID, fromMe: false, participant: BOB },
                    message: { conversation: 'mensagem antiga' },
                    messageTimestamp: Math.floor(Date.now() / 1_000) - 60
                }
            ]
        })

        assert.deepEqual(result.historyReceivers, [ALICE])
        assert.deepEqual(result.nonHistoryReceivers, [BOB])
        assert.equal(result.messagesCount, 1)

        const bundleStanza = await bundlePromise
        assert.equal(bundleStanza.attrs.to, GROUP_JID)

        const addressed = fanoutUserJids(bundleStanza)
        assert.ok(addressed.includes(ALICE.split('@')[0]), `alice missing: ${addressed.join(',')}`)
        assert.ok(
            !addressed.includes(BOB.split('@')[0]),
            `bob was addressed: ${addressed.join(',')}`
        )

        assert.equal(bundleStanza.attrs.phash, undefined)

        const uploads = server
            .capturedMediaUploadSnapshot()
            .filter((upload) => upload.path.startsWith('/mms/group-history/'))
        assert.equal(uploads.length, 1, `expected 1 bundle upload, got ${uploads.length}`)
        assert.equal(uploads[0].contentType, 'application/protobuf')
        assert.ok(uploads[0].encryptedBytes.byteLength > 0)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
