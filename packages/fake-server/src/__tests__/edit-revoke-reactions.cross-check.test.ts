/**
 * Phase 25 cross-checks: edit / revoke / reaction message types.
 *
 * Three flows, all driven by FakePeer convenience helpers and asserted
 * via the lib's `message` / `message_protocol` events:
 *   1. `sendMessageEdit` — `protocolMessage.type = MESSAGE_EDIT`
 *      carrying a fresh `conversation` payload.
 *   2. `sendMessageRevoke` — `protocolMessage.type = REVOKE` for a
 *      previously-sent message.
 *   3. `sendReaction` — `reactionMessage` with an emoji.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { proto ,type  WaClient,type  WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

function waitForMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs = 5_000
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

function waitForProtocolMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message_protocol']>[0]) => boolean,
    timeoutMs = 5_000
): Promise<Parameters<WaClientEventMap['message_protocol']>[0]> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for matching message_protocol')),
            timeoutMs
        )
        const listener: WaClientEventMap['message_protocol'] = (event) => {
            if (predicate(event)) {
                clearTimeout(timer)
                client.off('message_protocol', listener)
                resolve(event)
            }
        }
        client.on('message_protocol', listener)
    })
}

test('fake peer pushes a message edit and the lib emits a MESSAGE_EDIT protocol message', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'edit-message' })
    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: peerJid }, pipeline)

        const protocolPromise = waitForProtocolMessage(
            client,
            (event) =>
                event.protocolMessage.type === proto.Message.ProtocolMessage.Type.MESSAGE_EDIT
        )

        await peer.sendMessageEdit({
            targetMessageId: 'original-msg-id',
            newText: 'edited body of the message'
        })

        const event = await protocolPromise
        assert.equal(
            event.protocolMessage.type,
            proto.Message.ProtocolMessage.Type.MESSAGE_EDIT
        )
        assert.equal(event.protocolMessage.key?.id, 'original-msg-id')
        assert.equal(
            event.protocolMessage.editedMessage?.conversation,
            'edited body of the message'
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('fake peer pushes a message revoke and the lib emits a REVOKE protocol message', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'revoke-message' })
    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: peerJid }, pipeline)

        const protocolPromise = waitForProtocolMessage(
            client,
            (event) => event.protocolMessage.type === proto.Message.ProtocolMessage.Type.REVOKE
        )

        await peer.sendMessageRevoke({ targetMessageId: 'msg-to-revoke' })

        const event = await protocolPromise
        assert.equal(event.protocolMessage.type, proto.Message.ProtocolMessage.Type.REVOKE)
        assert.equal(event.protocolMessage.key?.id, 'msg-to-revoke')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})

test('fake peer pushes a reaction message and the lib emits the message event', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'reaction-message' })
    const peerJid = '5511777777777@s.whatsapp.net'

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: peerJid }, pipeline)

        const messagePromise = waitForMessage(
            client,
            (event) => event.message?.reactionMessage !== undefined && event.message?.reactionMessage !== null
        )

        await peer.sendReaction({
            targetMessageId: 'msg-to-react-to',
            emoji: '\u2764\ufe0f'
        })

        const event = await messagePromise
        assert.equal(event.senderJid, peerJid)
        assert.equal(event.message?.reactionMessage?.text, '\u2764\ufe0f')
        assert.equal(event.message?.reactionMessage?.key?.id, 'msg-to-react-to')
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
