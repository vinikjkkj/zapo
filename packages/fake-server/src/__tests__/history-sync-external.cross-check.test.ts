/**
 * Phase 19 cross-check: history sync via external (downloaded) blob.
 *
 * Scenario:
 *   1. Real WaClient connects + completes the noise handshake.
 *   2. Test encodes a `HistorySync` proto + zlib-compresses it via
 *      `encodeHistorySyncPlaintext` (the same encoder used by the
 *      inline path) and publishes the bytes as an `history` media blob
 *      via `server.publishMediaBlob`. The fake server runs the lib's
 *      real `WaMediaCrypto.encryptBytes` against the plaintext, mints
 *      a fresh 32-byte media key, computes both sha-256 integrity
 *      hashes, and stores the ciphertext keyed by a random URL path.
 *   3. Test triggers a fresh prekey upload, creates a FakePeer, then
 *      uses `peer.sendHistorySyncExternal` to push a
 *      `historySyncNotification` whose `directPath` is the absolute
 *      `http://127.0.0.1:port/<path>` URL the fake server's HTTP
 *      listener will serve, plus the mediaKey + sha-256s.
 *   4. The lib decrypts the protocol message, falls through to its
 *      media transfer client, GETs the encrypted blob from the fake
 *      server, decrypts via real `WaMediaCrypto.decryptBytes`,
 *      decompresses, decodes the `HistorySync` proto, persists the
 *      conversations + pushnames + messages and emits
 *      `history_sync_chunk`.
 *   5. Test asserts the event counts match the input.
 *
 * The whole pipeline runs against the lib's real media transfer +
 * crypto path with no stubbing on either side.
 *
 * NOTE: imports zapo-js via the cross-check helper.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'
import { encodeHistorySyncPlaintext } from '../protocol/push/history-sync'

import { createZapoClient } from './helpers/zapo-client'

function waitForEvent<K extends keyof WaClientEventMap>(
    client: WaClient,
    event: K,
    timeoutMs = 8_000
): Promise<Parameters<WaClientEventMap[K]>> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`timed out waiting for "${String(event)}"`)),
            timeoutMs
        )
        client.once(event, ((...args: Parameters<WaClientEventMap[K]>) => {
            clearTimeout(timer)
            resolve(args)
        }) as WaClientEventMap[K])
    })
}

test('fake peer pushes a history sync via external blob and the lib downloads + decrypts it', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, {
        sessionId: 'history-sync-external',
        historySyncEnabled: true
    })

    const chunkPromise = waitForEvent(client, 'history_sync_chunk', 10_000)

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)

        const plaintext = await encodeHistorySyncPlaintext({
            chunkOrder: 0,
            progress: 100,
            conversations: [
                {
                    id: '5511777777777@s.whatsapp.net',
                    name: 'Friend',
                    unreadCount: 5,
                    messages: [
                        {
                            id: 'external-history-1',
                            fromMe: false,
                            timestamp: 1_700_000_000,
                            message: { conversation: 'first old message' }
                        },
                        {
                            id: 'external-history-2',
                            fromMe: true,
                            timestamp: 1_700_000_100,
                            message: { conversation: 'second old message' }
                        }
                    ]
                },
                {
                    id: '5511666666666@s.whatsapp.net',
                    name: 'Coworker',
                    unreadCount: 0,
                    messages: [
                        {
                            id: 'external-history-3',
                            fromMe: false,
                            timestamp: 1_700_000_200,
                            message: { conversation: 'lone message' }
                        }
                    ]
                }
            ],
            pushnames: [
                { id: '5511777777777@s.whatsapp.net', pushname: 'Friend Display' },
                { id: '5511666666666@s.whatsapp.net', pushname: 'Coworker Display' }
            ]
        })

        const blob = await server.publishMediaBlob({
            mediaType: 'history',
            plaintext
        })

        const peer = await server.createFakePeer(
            { jid: '5511888888888@s.whatsapp.net', displayName: 'Primary Device' },
            pipeline
        )

        await peer.sendHistorySyncExternal({
            chunkOrder: 0,
            progress: 100,
            directPath: server.mediaUrl(blob.path),
            mediaKey: blob.mediaKey,
            fileSha256: blob.fileSha256,
            fileEncSha256: blob.fileEncSha256,
            fileLength: blob.fileLength
        })

        const [event] = await chunkPromise
        assert.equal(event.conversationsCount, 2)
        assert.equal(event.messagesCount, 3)
        assert.equal(event.pushnamesCount, 2)
        assert.equal(event.chunkOrder, 0)
        assert.equal(event.progress, 100)
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
