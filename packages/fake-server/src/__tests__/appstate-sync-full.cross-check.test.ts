/**
 * Phase 18 cross-check: full app-state sync round-trip with real
 * encrypted snapshot bytes.
 *
 * Scenario:
 *   1. Real WaClient connects + completes the noise handshake.
 *   2. Test mints a fresh sync key (random keyId + 32 random bytes).
 *   3. Test builds a `FakeAppStateCollection` for `regular_high`,
 *      applies one MUTE mutation against a chat jid, and registers a
 *      provider returning the resulting snapshot via
 *      `server.provideAppStateCollection`.
 *   4. Test triggers a fresh prekey upload, creates a FakePeer, then
 *      uses `peer.sendAppStateSyncKeyShare` to ship the sync key inside
 *      an encrypted protocolMessage.
 *   5. The lib decrypts the message, persists the key, and auto-triggers
 *      `syncAppState()`. The auto-registered IQ handler ships the
 *      snapshot for `regular_high` (and empty success for the other
 *      collections).
 *   6. The lib decrypts the snapshot mutation, advances its collection
 *      state to version 1, persists the mutation, and emits a
 *      `chat_event` event of action="mute" with the mute payload.
 *   7. Test asserts the event matches the input mutation.
 *
 * The whole pipeline runs against the lib's real `WaAppStateCrypto`
 * (mutation/value/snapshot/patch MAC, LTHash transition) — there is no
 * mock or stub on either side; the fake server's `FakeAppStateCrypto`
 * is bit-compatible with the lib.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

type WaChatEvent = Parameters<WaClientEventMap['chat_event']>[0]

import { FakeWaServer } from '../api/FakeWaServer'
import { FakeAppStateCollection } from '../state/fake-app-state-collection'

import { createZapoClient } from './helpers/zapo-client'

function waitForChatEvent(
    client: WaClient,
    predicate: (event: WaChatEvent) => boolean,
    timeoutMs = 8_000
): Promise<WaChatEvent> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error('timed out waiting for matching chat_event')),
            timeoutMs
        )
        const listener: WaClientEventMap['chat_event'] = (event) => {
            if (predicate(event)) {
                clearTimeout(timer)
                client.off('chat_event', listener)
                resolve(event)
            }
        }
        client.on('chat_event', listener)
    })
}

test('full app-state sync round-trip ships an encrypted patch the lib decrypts', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'app-state-full' })

    const chatJid = '5511777777777@s.whatsapp.net'
    const muteEnd = Date.now() + 60 * 60 * 1_000
    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))

    const collection = new FakeAppStateCollection({
        name: 'regular_high',
        keyId: syncKeyId,
        keyData: syncKeyData
    })
    // The mutation index format mirrors the lib's
    // `buildMutationIndex(action, chatJid, ...)` which JSON-encodes
    // ['mute', chatJid] for a chat-mute mutation.
    await collection.applyMutation({
        operation: 'set',
        index: JSON.stringify(['mute', chatJid]),
        value: {
            timestamp: Date.now(),
            muteAction: {
                muted: true,
                muteEndTimestamp: muteEnd
            }
        },
        version: 2
    })
    // Encode an inline `SyncdPatch` (version 0 → 1) with our mutation.
    // The wire `<snapshot>` field carries an `ExternalBlobReference` and
    // would require a media CDN to download the actual `SyncdSnapshot`
    // bytes — we ship the equivalent state via an inline `<patches><patch>`
    // instead, which the lib decodes immediately without an external
    // download. The patch's snapshotMac/patchMac are computed against
    // the post-mutation LTHash, which mirrors the empty-base-hash the
    // lib carries in its initial collection state.
    const patchBytes = await collection.encodePendingPatch()
    const patchVersion = collection.version

    // Hand the patch to the auto IQ handler. The first call returns the
    // patch once; subsequent rounds get an empty success at the already-
    // bumped version.
    let patchShipped = false
    server.provideAppStateCollection('regular_high', () => {
        if (patchShipped) {
            return {
                name: 'regular_high',
                version: patchVersion
            }
        }
        patchShipped = true
        return {
            name: 'regular_high',
            version: patchVersion,
            patches: [patchBytes]
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

        const muteEventPromise = waitForChatEvent(
            client,
            (event) => event.action === 'mute' && event.chatJid === chatJid
        )

        await peer.sendAppStateSyncKeyShare({
            keys: [
                {
                    keyId: syncKeyId,
                    keyData: syncKeyData,
                    timestamp: Date.now()
                }
            ]
        })

        const event = await muteEventPromise
        assert.equal(event.action, 'mute')
        assert.equal(event.chatJid, chatJid)
        assert.equal(event.collection, 'regular_high')
        assert.equal(event.source, 'patch')
        if (event.action === 'mute') {
            assert.equal(event.muted, true)
        }
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
