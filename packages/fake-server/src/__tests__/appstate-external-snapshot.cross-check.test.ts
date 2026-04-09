/**
 * Phase 22 cross-check: app-state sync via external `md-app-state`
 * media blob.
 *
 * Scenario:
 *   1. Real WaClient connects + completes the noise handshake.
 *   2. Test mints a fresh sync key, applies a chat MUTE mutation to a
 *      `FakeAppStateCollection` for `regular_high`, and encodes the
 *      collection as a `SyncdSnapshot` blob.
 *   3. The snapshot bytes are published as an `md-app-state` media
 *      blob via `server.publishMediaBlob`. The fake server runs the
 *      lib's real `WaMediaCrypto.encryptBytes` against the snapshot,
 *      mints a fresh 32-byte media key + sha-256s, and stores the
 *      ciphertext on the HTTPS listener.
 *   4. Test wraps the blob descriptor inside an `ExternalBlobReference`
 *      proto via `buildExternalBlobReference` and registers a payload
 *      provider that ships it inside the `<sync><collection><snapshot>`
 *      child of the next app-state sync IQ response.
 *   5. Test ships the sync key to the lib via
 *      `peer.sendAppStateSyncKeyShare`. The lib auto-imports the key,
 *      auto-syncs, sees the `<snapshot>`, downloads + decrypts the
 *      blob via real `WaMediaTransferClient.downloadAndDecrypt`,
 *      decodes the inner `SyncdSnapshot`, applies the contained
 *      mutation, and emits a `chat_event { action: 'mute', ... }`.
 *
 * The whole pipeline runs against the lib's real media transfer +
 * app-state crypto path with no stubbing on either side.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildExternalBlobReference } from '../protocol/iq/appstate-sync'
import { FakeAppStateCollection } from '../state/fake-app-state-collection'

import { createZapoClient } from './helpers/zapo-client'

type WaChatEvent = Parameters<WaClientEventMap['chat_event']>[0]

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

test('app-state sync via external md-app-state snapshot blob', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, {
        sessionId: 'app-state-external-snapshot',
        // The lib's WaClient skips snapshot-source mutations from the
        // chat_event stream by default — we need to opt in so the test
        // can observe the mute action that arrived inside the snapshot.
        emitSnapshotMutations: true
    })

    const chatJid = '5511777777777@s.whatsapp.net'
    const muteEnd = Date.now() + 30 * 60 * 1_000
    const syncKeyId = new Uint8Array(randomBytes(16))
    const syncKeyData = new Uint8Array(randomBytes(32))

    const collection = new FakeAppStateCollection({
        name: 'regular_high',
        keyId: syncKeyId,
        keyData: syncKeyData
    })
    await collection.applyMutation({
        operation: 'set',
        index: JSON.stringify(['mute', chatJid]),
        value: {
            timestamp: Date.now(),
            muteAction: { muted: true, muteEndTimestamp: muteEnd }
        },
        version: 2
    })
    const snapshotBytes = await collection.encodeSnapshot()
    const snapshotVersion = collection.version

    // Publish the snapshot bytes as an md-app-state media blob — the
    // lib will GET them from the fake HTTPS listener and run real
    // WaMediaCrypto.decryptBytes against the ciphertext.
    const mediaBlob = await server.publishMediaBlob({
        mediaType: 'md-app-state',
        plaintext: snapshotBytes
    })

    let snapshotShipped = false
    server.provideAppStateCollection('regular_high', () => {
        if (snapshotShipped) {
            return {
                name: 'regular_high',
                version: snapshotVersion
            }
        }
        snapshotShipped = true
        return {
            name: 'regular_high',
            version: snapshotVersion,
            snapshot: buildExternalBlobReference({
                mediaKey: mediaBlob.mediaKey,
                directPath: server.mediaUrl(mediaBlob.path),
                fileSha256: mediaBlob.fileSha256,
                fileEncSha256: mediaBlob.fileEncSha256,
                fileSizeBytes: mediaBlob.fileLength
            })
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
            keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
        })

        const event = await muteEventPromise
        assert.equal(event.action, 'mute')
        assert.equal(event.chatJid, chatJid)
        assert.equal(event.collection, 'regular_high')
        assert.equal(event.source, 'snapshot')
        if (event.action === 'mute') {
            assert.equal(event.muted, true)
        }
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
