/** Cross-check: client uploads encrypted app-state patch and fake server decrypts it. */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import { FakeWaServer } from '../api/FakeWaServer'
import { FakeAppStateCollection } from '../state/fake-app-state-collection'

import { createZapoClient } from './helpers/zapo-client'

test('client.chat.setChatMute uploads an encrypted patch the fake server decrypts', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'app-state-outgoing' })

    const targetChatJid = '5511777777777@s.whatsapp.net'
    const placeholderChatJid = '5511555555555@s.whatsapp.net'
    const muteEnd = Date.now() + 60 * 60 * 1_000
    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))

    server.registerAppStateSyncKey(syncKeyId, syncKeyData)

    const collection = new FakeAppStateCollection({
        name: 'regular_high',
        keyId: syncKeyId,
        keyData: syncKeyData
    })
    await collection.applyMutation({
        operation: 'set',
        index: JSON.stringify(['mute', placeholderChatJid]),
        value: {
            timestamp: Date.now(),
            muteAction: { muted: false }
        },
        version: 2
    })
    const bootstrapPatch = await collection.encodePendingPatch()
    const bootstrapVersion = collection.version

    let bootstrapShipped = false
    server.provideAppStateCollection('regular_high', () => {
        if (bootstrapShipped) {
            return {
                name: 'regular_high',
                version: bootstrapVersion
            }
        }
        bootstrapShipped = true
        return {
            name: 'regular_high',
            version: bootstrapVersion,
            patches: [bootstrapPatch]
        }
    })

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)

        const peer = await server.createFakePeer(
            { jid: '5511888888888@s.whatsapp.net', displayName: 'Primary Device' },
            pipeline
        )

        const bootstrapEventPromise = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('placeholder mutation never applied')),
                8_000
            )
            const handler = (event: { readonly chatJid?: string }): void => {
                if (event.chatJid === placeholderChatJid) {
                    clearTimeout(timer)
                    client.off('chat_event', handler)
                    resolve()
                }
            }
            client.on('chat_event', handler)
        })

        await peer.sendAppStateSyncKeyShare({
            keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
        })

        await bootstrapEventPromise

        const mutationPromise = server.expectAppStateMutation(
            (mutation) =>
                mutation.collection === 'regular_high' &&
                mutation.action === 'mute' &&
                mutation.index.includes(targetChatJid),
            8_000
        )

        await client.chat.setChatMute(targetChatJid, true, muteEnd)

        const captured = await mutationPromise
        assert.equal(captured.collection, 'regular_high')
        assert.equal(captured.operation, 'set')
        assert.equal(captured.action, 'mute')
        assert.ok(captured.value, 'captured mutation should carry a value')
        assert.equal(captured.value?.muteAction?.muted, true)
        const capturedMuteEnd = Number(captured.value?.muteAction?.muteEndTimestamp)
        assert.equal(capturedMuteEnd, muteEnd)
        assert.ok(
            Number.isFinite(captured.patchVersion),
            `patch version should be a finite number, got ${captured.patchVersion}`
        )
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
