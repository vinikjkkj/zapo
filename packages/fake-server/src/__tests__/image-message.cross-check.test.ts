import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import { FakeWaServer } from '../api/FakeWaServer'

import { createZapoClient } from './helpers/zapo-client'

function waitForMessage(
    client: WaClient,
    predicate: (event: Parameters<WaClientEventMap['message']>[0]) => boolean,
    timeoutMs = 8_000
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

test('fake peer pushes an imageMessage and the lib downloads + decrypts the attachment', async () => {
    const server = await FakeWaServer.start()
    const { client } = createZapoClient(server, { sessionId: 'image-message' })

    const plaintext = new Uint8Array(2 * 1024)
    for (let index = 0; index < plaintext.byteLength; index += 1) {
        plaintext[index] = (index * 31 + 7) & 0xff
    }

    try {
        await client.connect()
        const pipeline = await server.waitForAuthenticatedPipeline()
        await server.triggerPreKeyUpload(pipeline)

        const blob = await server.publishMediaBlob({
            mediaType: 'image',
            plaintext
        })

        const peer = await server.createFakePeer(
            { jid: '5511888888888@s.whatsapp.net', displayName: 'Photo Friend' },
            pipeline
        )

        const messagePromise = waitForMessage(
            client,
            (event) => event.message?.imageMessage !== undefined && event.message?.imageMessage !== null
        )

        await peer.sendImageMessage({
            directPath: server.mediaUrl(blob.path),
            mediaKey: blob.mediaKey,
            fileSha256: blob.fileSha256,
            fileEncSha256: blob.fileEncSha256,
            fileLength: blob.fileLength,
            mimetype: 'image/jpeg',
            caption: 'fake jpeg'
        })

        const event = await messagePromise
        const imageMessage = event.message?.imageMessage
        assert.ok(imageMessage, 'image message proto should be present')
        assert.equal(imageMessage.caption, 'fake jpeg')
        assert.equal(imageMessage.mimetype, 'image/jpeg')
        assert.ok(imageMessage.directPath, 'directPath should be set')
        assert.ok(imageMessage.mediaKey, 'mediaKey should be set')

        const downloaded = await client.mediaTransfer.downloadAndDecrypt({
            directPath: imageMessage.directPath,
            mediaType: 'image',
            mediaKey: imageMessage.mediaKey,
            fileSha256: imageMessage.fileSha256 as Uint8Array,
            fileEncSha256: imageMessage.fileEncSha256 as Uint8Array
        })

        assert.equal(downloaded.byteLength, plaintext.byteLength)
        for (let index = 0; index < plaintext.byteLength; index += 1) {
            if (downloaded[index] !== plaintext[index]) {
                throw new Error(
                    `decrypted byte mismatch at offset ${index}: ${downloaded[index]} vs ${plaintext[index]}`
                )
            }
        }
    } finally {
        await client.disconnect().catch(() => undefined)
        await server.stop()
    }
})
