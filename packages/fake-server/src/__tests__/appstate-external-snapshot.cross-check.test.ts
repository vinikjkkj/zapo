/** Cross-check: app-state sync via external `md-app-state` snapshot blob. */

import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { buildExternalBlobReference } from '../protocol/iq/appstate-sync'
import { FakeAppStateCollection } from '../state/fake-app-state-collection'

import { createZapoClient } from './helpers/zapo-client'

type WaAppStateMutationEvent = Parameters<WaClientEventMap['mutation']>[0]

function waitForMutation(
    client: WaClient,
    predicate: (event: WaAppStateMutationEvent) => boolean,
    timeoutMs = 8_000
): Promise<WaAppStateMutationEvent> {
    return new Promise((resolve, reject) => {
        const cleanup = (): void => {
            clearTimeout(timer)
            client.off('mutation', listener)
        }
        const timer = setTimeout(() => {
            cleanup()
            reject(new Error('timed out waiting for matching mutation'))
        }, timeoutMs)
        const listener: WaClientEventMap['mutation'] = (event) => {
            if (predicate(event)) {
                cleanup()
                resolve(event)
            }
        }
        client.on('mutation', listener)
    })
}

test('app-state sync via external md-app-state snapshot blob', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, {
        sessionId: 'app-state-external-snapshot',
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

        const muteEventPromise = waitForMutation(
            client,
            (event) =>
                event.schema === 'Mute' && event.operation === 'set' && event.chatJid === chatJid
        )

        await peer.sendAppStateSyncKeyShare({
            keys: [{ keyId: syncKeyId, keyData: syncKeyData, timestamp: Date.now() }]
        })

        const event = await muteEventPromise
        assert.equal(event.schema, 'Mute')
        assert.equal(event.collection, 'regular_high')
        assert.equal(event.source, 'snapshot')
        if (event.schema === 'Mute' && event.operation === 'set') {
            assert.equal(event.chatJid, chatJid)
            assert.equal(event.muted, true)
        }
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
