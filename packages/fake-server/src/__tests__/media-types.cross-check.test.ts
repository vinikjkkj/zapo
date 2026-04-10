import assert from 'node:assert/strict'
import test from 'node:test'

import type { WaClient, WaClientEventMap } from 'zapo-js'

import type { FakePeer } from '../api/FakePeer'
import { FakeWaServer } from '../api/FakeWaServer'
import type { FakeMediaType } from '../state/fake-media-store'
import type { Proto } from '../transport/protos'

import { createZapoClient } from './helpers/zapo-client'

interface MediaTypeCase {
    readonly name: string
    readonly mediaType: FakeMediaType
    readonly mimetype: string
    readonly send: (
        peer: FakePeer,
        descriptor: {
            readonly directPath: string
            readonly mediaKey: Uint8Array
            readonly fileSha256: Uint8Array
            readonly fileEncSha256: Uint8Array
            readonly fileLength: number
            readonly mimetype: string
        }
    ) => Promise<void>
    readonly extractDescriptor: (
        message: Proto.IMessage
    ) =>
        | {
              readonly directPath?: string | null
              readonly mediaKey?: Uint8Array | null
              readonly fileSha256?: Uint8Array | null
              readonly fileEncSha256?: Uint8Array | null
          }
        | null
        | undefined
}

const cases: readonly MediaTypeCase[] = [
    {
        name: 'video',
        mediaType: 'video',
        mimetype: 'video/mp4',
        send: (peer, d) => peer.sendVideoMessage({ ...d, seconds: 7, width: 640, height: 480 }),
        extractDescriptor: (m) => m.videoMessage
    },
    {
        name: 'audio',
        mediaType: 'audio',
        mimetype: 'audio/mp4',
        send: (peer, d) => peer.sendAudioMessage({ ...d, seconds: 12 }),
        extractDescriptor: (m) => m.audioMessage
    },
    {
        name: 'ptt',
        mediaType: 'ptt',
        mimetype: 'audio/ogg',
        send: (peer, d) => peer.sendAudioMessage({ ...d, seconds: 4, ptt: true }),
        extractDescriptor: (m) => m.audioMessage
    },
    {
        name: 'document',
        mediaType: 'document',
        mimetype: 'application/pdf',
        send: (peer, d) =>
            peer.sendDocumentMessage({
                ...d,
                title: 'fake.pdf',
                fileName: 'fake.pdf',
                pageCount: 3
            }),
        extractDescriptor: (m) => m.documentMessage
    },
    {
        name: 'sticker',
        mediaType: 'sticker',
        mimetype: 'image/webp',
        send: (peer, d) =>
            peer.sendStickerMessage({ ...d, width: 512, height: 512 }),
        extractDescriptor: (m) => m.stickerMessage
    }
]

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

for (const testCase of cases) {
    test(`fake peer pushes a ${testCase.name} message and the lib downloads + decrypts it`, async () => {
        const server = await FakeWaServer.start()
        const { client } = createZapoClient(server, { sessionId: `media-${testCase.name}` })

        const plaintext = new Uint8Array(1024)
        for (let index = 0; index < plaintext.byteLength; index += 1) {
            plaintext[index] = (index * 13 + testCase.name.charCodeAt(0)) & 0xff
        }

        try {
            await client.connect()
            const pipeline = await server.waitForAuthenticatedPipeline()
            await server.triggerPreKeyUpload(pipeline)

            const blob = await server.publishMediaBlob({
                mediaType: testCase.mediaType,
                plaintext
            })
            const peer = await server.createFakePeer(
                { jid: '5511888888888@s.whatsapp.net' },
                pipeline
            )

            const messagePromise = waitForMessage(client, (event) => {
                const descriptor = testCase.extractDescriptor(event.message ?? {})
                return descriptor !== undefined && descriptor !== null
            })

            await testCase.send(peer, {
                directPath: server.mediaUrl(blob.path),
                mediaKey: blob.mediaKey,
                fileSha256: blob.fileSha256,
                fileEncSha256: blob.fileEncSha256,
                fileLength: blob.fileLength,
                mimetype: testCase.mimetype
            })

            const event = await messagePromise
            const descriptor = testCase.extractDescriptor(event.message ?? {})
            assert.ok(descriptor, `expected ${testCase.name} descriptor on message`)
            assert.ok(descriptor.directPath, 'directPath should be set')
            assert.ok(descriptor.mediaKey, 'mediaKey should be set')

            const downloaded = await client.mediaTransfer.downloadAndDecrypt({
                directPath: descriptor.directPath,
                mediaType: testCase.mediaType,
                mediaKey: descriptor.mediaKey,
                fileSha256: descriptor.fileSha256 as Uint8Array,
                fileEncSha256: descriptor.fileEncSha256 as Uint8Array
            })
            assert.equal(downloaded.byteLength, plaintext.byteLength)
            for (let index = 0; index < plaintext.byteLength; index += 1) {
                if (downloaded[index] !== plaintext[index]) {
                    throw new Error(
                        `${testCase.name}: byte mismatch at ${index} (${downloaded[index]} vs ${plaintext[index]})`
                    )
                }
            }
        } finally {
            await client.disconnect().catch(() => undefined)
            await server.stop()
        }
    })
}
