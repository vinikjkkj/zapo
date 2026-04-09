/**
 * Phase 29 cross-check: poll creation message round-trip.
 *
 * Scenario:
 *   1. Fake peer sends a `pollCreationMessageV3` with two options.
 *   2. Lib decrypts and emits the standard `message` event with the
 *      poll creation proto preserved.
 *   3. Test asserts the poll name and option labels.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

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

test('fake peer pushes a poll creation message and the lib emits message', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'poll-message' })
    const peerJid = '5511777777777@s.whatsapp.net'
    const encKey = new Uint8Array(randomBytes(32))

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)
        const peer = await server.createFakePeer({ jid: peerJid }, pipeline)

        const messagePromise = waitForMessage(
            client,
            (event) =>
                event.message?.pollCreationMessageV3 !== undefined &&
                event.message?.pollCreationMessageV3 !== null
        )

        await peer.sendMessage({
            pollCreationMessageV3: {
                encKey,
                name: 'Pizza ou hambúrguer?',
                selectableOptionsCount: 1,
                options: [
                    { optionName: 'Pizza' },
                    { optionName: 'Hambúrguer' }
                ]
            }
        })

        const event = await messagePromise
        const poll = event.message?.pollCreationMessageV3
        assert.ok(poll, 'poll creation message should be present')
        assert.equal(poll.name, 'Pizza ou hambúrguer?')
        assert.equal(poll.options?.length, 2)
        assert.equal(poll.options?.[0].optionName, 'Pizza')
        assert.equal(poll.options?.[1].optionName, 'Hambúrguer')
        assert.equal(poll.selectableOptionsCount, 1)
        assert.equal(event.senderJid, peerJid)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
