import assert from 'node:assert/strict'
import { stat, unlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import test from 'node:test'

import { parseWebpAnimation, runMediaProcessor } from '@client/media'
import { buildMediaMessageContent, getMediaConn } from '@client/messages'
import type { Logger } from '@infra/log/types'
import { parseMediaConnResponse } from '@media/conn'
import { WaMediaCrypto } from '@media/WaMediaCrypto'
import { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import type { BinaryNode } from '@transport/types'

function createLogger(): Logger {
    return {
        level: 'trace',
        trace: () => undefined,
        debug: () => undefined,
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
    }
}

function buildMediaConnNode(auth = 'token', ttl = '120'): BinaryNode {
    return {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            {
                tag: 'media_conn',
                attrs: { auth, ttl },
                content: [{ tag: 'host', attrs: { hostname: 'mmg.whatsapp.net' } }]
            }
        ]
    }
}

function createWebpWithChunks(
    chunks: ReadonlyArray<{ readonly tag: string; readonly payloadLength: number }>
): {
    readonly bytes: Uint8Array
    readonly offsets: readonly number[]
} {
    const vp8xLength = 10
    let totalLength = 12 + 8 + vp8xLength
    for (const chunk of chunks) {
        totalLength += 8 + chunk.payloadLength + (chunk.payloadLength % 2)
    }

    const bytes = new Uint8Array(totalLength)
    bytes[0] = 0x52
    bytes[1] = 0x49
    bytes[2] = 0x46
    bytes[3] = 0x46
    bytes[8] = 0x57
    bytes[9] = 0x45
    bytes[10] = 0x42
    bytes[11] = 0x50
    bytes[12] = 0x56
    bytes[13] = 0x50
    bytes[14] = 0x38
    bytes[15] = 0x58
    bytes[16] = vp8xLength

    const offsets: number[] = []
    let offset = 12 + 8 + vp8xLength
    for (const chunk of chunks) {
        offsets.push(offset)
        bytes[offset] = chunk.tag.charCodeAt(0)
        bytes[offset + 1] = chunk.tag.charCodeAt(1)
        bytes[offset + 2] = chunk.tag.charCodeAt(2)
        bytes[offset + 3] = chunk.tag.charCodeAt(3)
        bytes[offset + 4] = chunk.payloadLength & 0xff
        bytes[offset + 5] = (chunk.payloadLength >>> 8) & 0xff
        bytes[offset + 6] = (chunk.payloadLength >>> 16) & 0xff
        bytes[offset + 7] = (chunk.payloadLength >>> 24) & 0xff
        offset += 8 + chunk.payloadLength + (chunk.payloadLength % 2)
    }

    return { bytes, offsets }
}

function createPatternBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
        bytes[i] = i % 251
    }
    return bytes
}

function createChunkedReadable(bytes: Uint8Array, sizes: readonly number[]): Readable {
    let offset = 0
    return Readable.from(
        (async function* () {
            let index = 0
            while (offset < bytes.byteLength) {
                const size = sizes[index % sizes.length]
                const end = Math.min(offset + size, bytes.byteLength)
                yield bytes.subarray(offset, end)
                offset = end
                index++
            }
        })()
    )
}

async function readAllFromStream(stream: Readable): Promise<Uint8Array> {
    const chunks: Uint8Array[] = []
    for await (const chunk of stream) {
        const bufferChunk = Buffer.from(chunk as Uint8Array)
        chunks.push(
            new Uint8Array(bufferChunk.buffer, bufferChunk.byteOffset, bufferChunk.byteLength)
        )
    }
    const merged = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    return new Uint8Array(merged.buffer, merged.byteOffset, merged.byteLength)
}

test('media conn parser validates hosts/auth and ttl semantics', () => {
    const now = 1_000
    const response: BinaryNode = {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            {
                tag: 'media_conn',
                attrs: { auth: 'token', ttl: '60' },
                content: [
                    { tag: 'host', attrs: { hostname: 'mmg.whatsapp.net' }, content: undefined },
                    {
                        tag: 'host',
                        attrs: { hostname: 'fallback.host', type: 'fallback' },
                        content: undefined
                    }
                ]
            }
        ]
    }

    const parsed = parseMediaConnResponse(response, now)
    assert.equal(parsed.auth, 'token')
    assert.equal(parsed.hosts.length, 2)
    assert.equal(parsed.expiresAtMs, now + 60_000)

    assert.throws(
        () => parseMediaConnResponse({ tag: 'iq', attrs: { type: 'result' } }, now),
        /missing media_conn node/
    )
})

test('media crypto encrypt/decrypt bytes round-trip and hash validation', async () => {
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const plaintext = new Uint8Array([1, 2, 3, 4, 5, 6])

    const encrypted = await WaMediaCrypto.encryptBytes('image', mediaKey, plaintext)
    assert.ok(encrypted.ciphertextHmac.length > plaintext.length)
    assert.ok(encrypted.streamingSidecar!.byteLength > 0)

    const decrypted = await WaMediaCrypto.decryptBytes(
        'image',
        mediaKey,
        encrypted.ciphertextHmac,
        encrypted.fileSha256,
        encrypted.fileEncSha256
    )
    assert.deepEqual(decrypted.plaintext, plaintext)

    await assert.rejects(
        () =>
            WaMediaCrypto.decryptBytes(
                'image',
                mediaKey,
                encrypted.ciphertextHmac,
                new Uint8Array(32)
            ),
        /plaintext file hash mismatch/
    )
})

test('media crypto encryptReadable matches byte encryption for large payloads', async () => {
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const plaintext = createPatternBytes(200_000)

    const encryptedBytes = await WaMediaCrypto.encryptBytes('video', mediaKey, plaintext)
    const encryptedReadable = await WaMediaCrypto.encryptReadable(
        'video',
        mediaKey,
        createChunkedReadable(plaintext, [1, 7, 31, 4_096, 3, 16_384])
    )

    const [ciphertextReadable, metadata] = await Promise.all([
        readAllFromStream(encryptedReadable.encrypted),
        encryptedReadable.metadata
    ])

    assert.deepEqual(ciphertextReadable, encryptedBytes.ciphertextHmac)
    assert.deepEqual(metadata.fileSha256, encryptedBytes.fileSha256)
    assert.deepEqual(metadata.fileEncSha256, encryptedBytes.fileEncSha256)
    assert.deepEqual(metadata.streamingSidecar, encryptedBytes.streamingSidecar)
    assert.equal(metadata.plaintextLength, plaintext.byteLength)
})

test('media crypto decryptReadable round-trips fragmented payloads across block boundaries', async () => {
    for (const size of [0, 1, 15, 16, 17, 31, 32, 33, 100, 1_000, 150_000]) {
        const mediaKey = await WaMediaCrypto.generateMediaKey()
        const plaintext = createPatternBytes(size)
        const encryptedReadable = await WaMediaCrypto.encryptReadable(
            'audio',
            mediaKey,
            createChunkedReadable(plaintext, [5, 7, 11, 4_096])
        )

        const [ciphertext, encryptedMetadata] = await Promise.all([
            readAllFromStream(encryptedReadable.encrypted),
            encryptedReadable.metadata
        ])

        const decryptedReadable = await WaMediaCrypto.decryptReadable(
            createChunkedReadable(ciphertext, [2, 3, 5, 7, 8_191]),
            {
                mediaType: 'audio',
                mediaKey,
                expectedFileSha256: encryptedMetadata.fileSha256,
                expectedFileEncSha256: encryptedMetadata.fileEncSha256
            }
        )

        const [decryptedBytes, decryptedMetadata] = await Promise.all([
            readAllFromStream(decryptedReadable.plaintext),
            decryptedReadable.metadata
        ])

        assert.deepEqual(decryptedBytes, plaintext)
        assert.deepEqual(decryptedMetadata.fileSha256, encryptedMetadata.fileSha256)
        assert.deepEqual(decryptedMetadata.fileEncSha256, encryptedMetadata.fileEncSha256)
    }
})

test('parseWebpAnimation skips intermediate chunks and respects padded chunk sizes', () => {
    const webp = createWebpWithChunks([
        { tag: 'ICCP', payloadLength: 3 },
        { tag: 'ANMF', payloadLength: 4 }
    ])
    const anmfOffset = webp.offsets[1]

    assert.deepEqual(parseWebpAnimation(webp.bytes), {
        isAnimated: true,
        firstFrameLength: anmfOffset + 8 + 4
    })
})

test('parseWebpAnimation returns null for malformed chunk sizes that exceed the buffer', () => {
    const webp = createWebpWithChunks([{ tag: 'JUNK', payloadLength: 0 }])
    const sizeOffset = webp.offsets[0] + 4
    webp.bytes[sizeOffset] = 0x00
    webp.bytes[sizeOffset + 1] = 0x00
    webp.bytes[sizeOffset + 2] = 0x00
    webp.bytes[sizeOffset + 3] = 0x80

    assert.equal(parseWebpAnimation(webp.bytes), null)
})

test('runMediaProcessor fills image dimensions from thumbnail output when probe is skipped', async () => {
    const result = await runMediaProcessor(
        {
            processor: {
                generateImageThumbnail: async () => ({
                    jpegThumbnail: new Uint8Array([0xff, 0xd8]),
                    width: 123,
                    height: 45
                })
            }
        },
        new Uint8Array([1, 2, 3]),
        {
            type: 'image',
            media: new Uint8Array([1, 2, 3]),
            mimetype: 'image/jpeg'
        },
        createLogger()
    )

    assert.equal(result.width, 123)
    assert.equal(result.height, 45)
    assert.deepEqual(result.jpegThumbnail, new Uint8Array([0xff, 0xd8]))
})

test('runMediaProcessor derives audio seconds from waveform output when probe is absent', async () => {
    const result = await runMediaProcessor(
        {
            processor: {
                computeWaveform: async () => ({
                    waveform: new Uint8Array([4, 5, 6]),
                    durationSeconds: 7.9
                })
            }
        },
        new Uint8Array([1, 2, 3]),
        {
            type: 'audio',
            media: new Uint8Array([1, 2, 3]),
            mimetype: 'audio/ogg'
        },
        createLogger()
    )

    assert.equal(result.seconds, 7)
    assert.deepEqual(result.waveform, new Uint8Array([4, 5, 6]))
})

test('runMediaProcessor handles sticker thumbnails and animated WebP detection', async () => {
    const webp = createWebpWithChunks([{ tag: 'ANMF', payloadLength: 6 }])
    const result = await runMediaProcessor(
        {
            processor: {
                generateStickerThumbnail: async () => ({
                    pngThumbnail: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
                    width: 96,
                    height: 96
                })
            }
        },
        webp.bytes,
        {
            type: 'sticker',
            media: webp.bytes
        },
        createLogger()
    )

    assert.equal(result.isAnimated, true)
    assert.equal(result.firstFrameLength, webp.offsets[0] + 8 + 6)
    assert.equal(result.width, 96)
    assert.equal(result.height, 96)
    assert.deepEqual(result.pngThumbnail, new Uint8Array([0x89, 0x50, 0x4e, 0x47]))
})

test('runMediaProcessor skips processing work when the input is unavailable', async () => {
    let called = false
    const result = await runMediaProcessor(
        {
            processor: {
                computeWaveform: async () => {
                    called = true
                    return {
                        waveform: new Uint8Array([1]),
                        durationSeconds: 1
                    }
                }
            }
        },
        undefined,
        {
            type: 'audio',
            media: new Uint8Array([1, 2, 3]),
            mimetype: 'audio/ogg'
        },
        createLogger()
    )

    assert.deepEqual(result, {})
    assert.equal(called, false)
})

test('media message builder supports text passthrough and conn caching', async () => {
    const logger = createLogger()
    let cache: {
        auth: string
        expiresAtMs: number
        hosts: readonly { hostname: string; isFallback: boolean }[]
    } | null = null
    let queryCount = 0

    const asMessage = await buildMediaMessageContent(
        {
            logger,
            mediaTransfer: {} as never,
            queryWithContext: async () => {
                throw new Error('not used')
            },
            getMediaConnCache: () => cache,
            setMediaConnCache: (value) => {
                cache = value
            }
        },
        'hello'
    )
    assert.equal(asMessage.conversation, 'hello')

    const fetched = await getMediaConn(
        {
            logger,
            mediaTransfer: {} as never,
            queryWithContext: async () => {
                queryCount += 1
                return {
                    tag: 'iq',
                    attrs: { type: 'result' },
                    content: [
                        {
                            tag: 'media_conn',
                            attrs: { auth: 'token', ttl: '120' },
                            content: [{ tag: 'host', attrs: { hostname: 'mmg.whatsapp.net' } }]
                        }
                    ]
                }
            },
            getMediaConnCache: () => cache,
            setMediaConnCache: (value) => {
                cache = value
            }
        },
        false
    )
    assert.equal(fetched.auth, 'token')

    const cached = await getMediaConn(
        {
            logger,
            mediaTransfer: {} as never,
            queryWithContext: async () => {
                queryCount += 1
                throw new Error('should not fetch when cache is fresh')
            },
            getMediaConnCache: () => cache,
            setMediaConnCache: (value) => {
                cache = value
            }
        },
        false
    )

    assert.equal(cached.auth, 'token')
    assert.equal(queryCount, 1)
})

test('media message builder uploads ptv bytes and maps upload response fields', async () => {
    const logger = createLogger()
    const encoder = new TextEncoder()
    const uploadedRequests: {
        readonly url: string
        readonly contentLength?: number
    }[] = []

    const message = await buildMediaMessageContent(
        {
            logger,
            mediaTransfer: {
                uploadStream: async (request: {
                    readonly url: string
                    readonly contentLength?: number
                }) => {
                    uploadedRequests.push({
                        url: request.url,
                        contentLength: request.contentLength
                    })
                    return { status: 200 } as Response
                },
                readResponseBytes: async () =>
                    encoder.encode(
                        JSON.stringify({
                            url: 'https://mmg.whatsapp.net/mms/video/ok',
                            direct_path: '/mms/video/ok'
                        })
                    )
            } as never,
            queryWithContext: async () => buildMediaConnNode('auth-token', '120'),
            getMediaConnCache: () => null,
            setMediaConnCache: () => undefined
        },
        {
            type: 'ptv',
            media: new Uint8Array([1, 2, 3, 4]),
            mimetype: 'video/mp4',
            seconds: 7
        }
    )

    assert.ok(message.ptvMessage)
    assert.equal(message.ptvMessage?.fileLength, 4)
    assert.equal(message.ptvMessage?.seconds, 7)
    assert.ok((message.ptvMessage?.streamingSidecar?.byteLength ?? 0) > 0)
    assert.equal(uploadedRequests.length, 1)
    assert.match(uploadedRequests[0].url, /\/mms\/video\//)
    assert.match(uploadedRequests[0].url, /auth=auth-token/)
    assert.match(uploadedRequests[0].url, /token=/)
    assert.ok((uploadedRequests[0].contentLength ?? 0) > 0)
})

test('media message builder continues probe extraction when thumbnail generation fails', async () => {
    const errors: unknown[] = []
    const logger: Logger = {
        ...createLogger(),
        error: (message, context) => {
            errors.push({ message, context })
        }
    }
    const encoder = new TextEncoder()

    const message = await buildMediaMessageContent(
        {
            logger,
            mediaTransfer: {
                uploadStream: async () => ({ status: 200 }) as Response,
                readResponseBytes: async () =>
                    encoder.encode(
                        JSON.stringify({
                            url: 'https://mmg.whatsapp.net/mms/video/thumb-fail',
                            direct_path: '/mms/video/thumb-fail'
                        })
                    )
            } as never,
            queryWithContext: async () => buildMediaConnNode('auth-token', '120'),
            getMediaConnCache: () => null,
            setMediaConnCache: () => undefined,
            media: {
                processor: {
                    generateVideoThumbnail: async () => {
                        throw new Error('thumbnail failed')
                    },
                    probeMedia: async () => ({
                        durationSeconds: 9,
                        width: 640,
                        height: 480
                    })
                }
            }
        },
        {
            type: 'video',
            media: new Uint8Array([1, 2, 3, 4]),
            mimetype: 'video/mp4'
        }
    )

    assert.equal(message.videoMessage?.seconds, 9)
    assert.equal(message.videoMessage?.width, 640)
    assert.equal(message.videoMessage?.height, 480)
    assert.equal(message.videoMessage?.jpegThumbnail, undefined)
    assert.equal(errors.length, 1)
})

test('media message builder fills only missing probe fields', async () => {
    const logger = createLogger()
    const encoder = new TextEncoder()

    const message = await buildMediaMessageContent(
        {
            logger,
            mediaTransfer: {
                uploadStream: async () => ({ status: 200 }) as Response,
                readResponseBytes: async () =>
                    encoder.encode(
                        JSON.stringify({
                            url: 'https://mmg.whatsapp.net/mms/video/partial-probe',
                            direct_path: '/mms/video/partial-probe'
                        })
                    )
            } as never,
            queryWithContext: async () => buildMediaConnNode('auth-token', '120'),
            getMediaConnCache: () => null,
            setMediaConnCache: () => undefined,
            media: {
                processor: {
                    probeMedia: async () => ({
                        durationSeconds: 15,
                        width: 320,
                        height: 240
                    })
                }
            }
        },
        {
            type: 'video',
            media: new Uint8Array([1, 2, 3, 4]),
            mimetype: 'video/mp4',
            width: 999
        }
    )

    assert.equal(message.videoMessage?.seconds, 15)
    assert.equal(message.videoMessage?.width, 999)
    assert.equal(message.videoMessage?.height, 240)
})

test('media message builder reuses streamed media across processor steps', async () => {
    const logger = createLogger()
    const encoder = new TextEncoder()
    const calls: Array<{ readonly step: string; readonly isStream: boolean }> = []

    const message = await buildMediaMessageContent(
        {
            logger,
            mediaTransfer: {
                uploadStream: async () => ({ status: 200 }) as Response,
                readResponseBytes: async () =>
                    encoder.encode(
                        JSON.stringify({
                            url: 'https://mmg.whatsapp.net/mms/audio/streamed',
                            direct_path: '/mms/audio/streamed'
                        })
                    )
            } as never,
            queryWithContext: async () => buildMediaConnNode('auth-token', '120'),
            getMediaConnCache: () => null,
            setMediaConnCache: () => undefined,
            media: {
                processor: {
                    probeMedia: async (input) => {
                        calls.push({
                            step: 'probe',
                            isStream: !(input instanceof Uint8Array)
                        })
                        return { durationSeconds: 11 }
                    },
                    computeWaveform: async (input) => {
                        calls.push({
                            step: 'waveform',
                            isStream: !(input instanceof Uint8Array)
                        })
                        return { waveform: new Uint8Array([4, 5, 6]), durationSeconds: 7 }
                    }
                }
            }
        },
        {
            type: 'audio',
            media: Readable.from([new Uint8Array([1, 2, 3, 4])]),
            mimetype: 'audio/ogg'
        }
    )

    assert.equal(message.audioMessage?.seconds, 11)
    assert.deepEqual(message.audioMessage?.waveform, new Uint8Array([4, 5, 6]))
    assert.ok((message.audioMessage?.streamingSidecar?.byteLength ?? 0) > 0)
    assert.deepEqual(calls, [
        { step: 'probe', isStream: true },
        { step: 'waveform', isStream: true }
    ])
})

test('media message builder supports file path input for upload and processing', async () => {
    const logger = createLogger()
    const encoder = new TextEncoder()
    const filePath = join(
        tmpdir(),
        `zapo-media-path-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`
    )
    const processorInputs: string[] = []

    await writeFile(filePath, new Uint8Array([1, 2, 3, 4]))

    try {
        const message = await buildMediaMessageContent(
            {
                logger,
                mediaTransfer: {
                    uploadStream: async () => ({ status: 200 }) as Response,
                    readResponseBytes: async () =>
                        encoder.encode(
                            JSON.stringify({
                                url: 'https://mmg.whatsapp.net/mms/video/from-path',
                                direct_path: '/mms/video/from-path'
                            })
                        )
                } as never,
                queryWithContext: async () => buildMediaConnNode('auth-token', '120'),
                getMediaConnCache: () => null,
                setMediaConnCache: () => undefined,
                media: {
                    processor: {
                        generateVideoThumbnail: async (input) => {
                            processorInputs.push(input as string)
                            return {
                                jpegThumbnail: new Uint8Array([0xff, 0xd8]),
                                width: 48,
                                height: 48
                            }
                        },
                        probeMedia: async (input) => {
                            processorInputs.push(input as string)
                            return {
                                durationSeconds: 12,
                                width: 640,
                                height: 480
                            }
                        }
                    }
                }
            },
            {
                type: 'video',
                media: filePath,
                mimetype: 'video/mp4'
            }
        )

        assert.equal(message.videoMessage?.seconds, 12)
        assert.equal(message.videoMessage?.width, 640)
        assert.equal(message.videoMessage?.height, 480)
        assert.deepEqual(message.videoMessage?.jpegThumbnail, new Uint8Array([0xff, 0xd8]))
        assert.deepEqual(processorInputs, [filePath, filePath])
    } finally {
        await unlink(filePath).catch(() => undefined)
    }
})

test('media message builder propagates upload response errors for byte uploads', async () => {
    const logger = createLogger()
    const content = {
        type: 'image' as const,
        media: new Uint8Array([1, 2, 3]),
        mimetype: 'image/jpeg'
    }

    await assert.rejects(
        () =>
            buildMediaMessageContent(
                {
                    logger,
                    mediaTransfer: {
                        uploadStream: async () => ({ status: 500 }) as Response,
                        readResponseBytes: async () => new TextEncoder().encode('{}')
                    } as never,
                    queryWithContext: async () => buildMediaConnNode(),
                    getMediaConnCache: () => null,
                    setMediaConnCache: () => undefined
                },
                content
            ),
        /media upload failed with status 500/
    )

    await assert.rejects(
        () =>
            buildMediaMessageContent(
                {
                    logger,
                    mediaTransfer: {
                        uploadStream: async () => ({ status: 200 }) as Response,
                        readResponseBytes: async () => new TextEncoder().encode('not-json')
                    } as never,
                    queryWithContext: async () => buildMediaConnNode(),
                    getMediaConnCache: () => null,
                    setMediaConnCache: () => undefined
                },
                content
            ),
        /media upload returned invalid json/
    )

    await assert.rejects(
        () =>
            buildMediaMessageContent(
                {
                    logger,
                    mediaTransfer: {
                        uploadStream: async () => ({ status: 200 }) as Response,
                        readResponseBytes: async () =>
                            new TextEncoder().encode(JSON.stringify({ url: 'https://mmg/a' }))
                    } as never,
                    queryWithContext: async () => buildMediaConnNode(),
                    getMediaConnCache: () => null,
                    setMediaConnCache: () => undefined
                },
                content
            ),
        /media upload response missing url\/direct_path/
    )
})

test('media message builder cleans encrypted temp file when stream upload fails', async () => {
    const logger = createLogger()
    const originalCleanup = WaMediaCrypto.cleanupEncryptedFile
    const cleanupPaths: string[] = []
    ;(
        WaMediaCrypto as unknown as {
            cleanupEncryptedFile: (filePath: string) => Promise<void>
        }
    ).cleanupEncryptedFile = async (filePath: string) => {
        cleanupPaths.push(filePath)
        await originalCleanup(filePath)
    }

    try {
        await assert.rejects(
            () =>
                buildMediaMessageContent(
                    {
                        logger,
                        mediaTransfer: {
                            uploadStream: async (request: { readonly body?: Readable }) => {
                                request.body?.on('error', () => undefined)
                                throw new Error('forced stream upload failure')
                            },
                            readResponseBytes: async () => new Uint8Array([])
                        } as never,
                        queryWithContext: async () => buildMediaConnNode(),
                        getMediaConnCache: () => null,
                        setMediaConnCache: () => undefined
                    },
                    {
                        type: 'audio',
                        media: Readable.from([new Uint8Array([1, 2, 3, 4])]),
                        mimetype: 'audio/ogg'
                    }
                ),
            /forced stream upload failure/
        )
        assert.equal(cleanupPaths.length, 1)
        await assert.rejects(() => stat(cleanupPaths[0]), /ENOENT|no such file/i)
    } finally {
        ;(
            WaMediaCrypto as unknown as {
                cleanupEncryptedFile: (filePath: string) => Promise<void>
            }
        ).cleanupEncryptedFile = originalCleanup
    }
})

test('media transfer client applies separate upload/download agents', async () => {
    const server = http.createServer((req, res) => {
        if (req.method === 'GET') {
            res.writeHead(200, { 'content-type': 'text/plain' })
            res.end('download-ok')
            return
        }
        if (req.method === 'POST' && req.url?.includes('/ul-stream')) {
            req.resume()
            req.on('end', () => {
                res.writeHead(202, { 'content-type': 'text/plain' })
                res.end('upload-stream-ok')
            })
            return
        }
        req.resume()
        req.on('end', () => {
            res.writeHead(201, { 'content-type': 'text/plain' })
            res.end('upload-ok')
        })
    })
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject)
            resolve()
        })
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to resolve test server address')
    }
    const base = `http://127.0.0.1:${address.port}`
    const downloadAgent = new http.Agent({ keepAlive: true })
    const uploadAgent = new http.Agent({ keepAlive: true })

    try {
        const mediaTransfer = new WaMediaTransferClient({
            defaultDownloadAgent: downloadAgent,
            defaultUploadAgent: uploadAgent
        })

        const downloadResponse = await mediaTransfer.downloadStream({
            url: `${base}/dl`
        })
        const uploadResponse = await mediaTransfer.uploadStream({
            url: `${base}/ul`,
            method: 'POST',
            body: new Uint8Array([1, 2, 3])
        })
        const streamUploadResponse = await mediaTransfer.uploadStream({
            url: `${base}/ul-stream`,
            method: 'POST',
            contentType: 'text/plain',
            body: Readable.from(['hello-', 'dispatcher'])
        })

        const [downloadBytes, uploadBytes, streamUploadBytes] = await Promise.all([
            mediaTransfer.readResponseBytes(downloadResponse),
            mediaTransfer.readResponseBytes(uploadResponse),
            mediaTransfer.readResponseBytes(streamUploadResponse)
        ])

        assert.equal(downloadResponse.status, 200)
        assert.equal(uploadResponse.status, 201)
        assert.equal(streamUploadResponse.status, 202)
        assert.equal(new TextDecoder().decode(downloadBytes), 'download-ok')
        assert.equal(new TextDecoder().decode(uploadBytes), 'upload-ok')
        assert.equal(new TextDecoder().decode(streamUploadBytes), 'upload-stream-ok')
    } finally {
        downloadAgent.destroy()
        uploadAgent.destroy()
        await new Promise<void>((resolve) => {
            server.close(() => resolve())
        })
    }
})

test('media transfer client routes through optional got when proxy agent is set', async () => {
    const server = http.createServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/plain' })
        response.end('ok-agent')
    })
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject)
            resolve()
        })
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to resolve media test server address')
    }
    const proxyAgent = new http.Agent({ keepAlive: true })
    const mediaTransfer = new WaMediaTransferClient({
        defaultDownloadAgent: proxyAgent
    })

    const originalFetch = globalThis.fetch
    let fetchCalled = false
    globalThis.fetch = (async () => {
        fetchCalled = true
        throw new Error('fetch should not be called when agent path is enabled')
    }) as typeof fetch

    try {
        const bytes = await mediaTransfer.downloadBytes({
            url: `http://127.0.0.1:${address.port}/agent-proxy`
        })
        assert.equal(new TextDecoder().decode(bytes), 'ok-agent')
        assert.equal(fetchCalled, false)
    } finally {
        globalThis.fetch = originalFetch
        proxyAgent.destroy()
        await new Promise<void>((resolve) => {
            server.close(() => resolve())
        })
    }
})

test('media transfer client uploads readable stream through optional got agent', async () => {
    const receivedBodies: string[] = []
    const receivedMethods: string[] = []
    const receivedContentTypes: string[] = []

    const server = http.createServer(async (request, response) => {
        receivedMethods.push(request.method ?? '')
        const contentType = request.headers['content-type']
        if (typeof contentType === 'string') {
            receivedContentTypes.push(contentType)
        }

        request.setEncoding('utf8')
        let body = ''
        for await (const chunk of request) {
            body += chunk
        }
        receivedBodies.push(body)

        response.writeHead(201, { 'content-type': 'text/plain' })
        response.end('upload-ok')
    })

    await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', () => {
            server.off('error', reject)
            resolve()
        })
    })

    const address = server.address()
    if (!address || typeof address === 'string') {
        throw new Error('failed to resolve media upload test server address')
    }

    const proxyAgent = new http.Agent({ keepAlive: true })
    const mediaTransfer = new WaMediaTransferClient({
        defaultUploadAgent: proxyAgent
    })

    const originalFetch = globalThis.fetch
    let fetchCalled = false
    globalThis.fetch = (async () => {
        fetchCalled = true
        throw new Error('fetch should not be called when upload agent path is enabled')
    }) as typeof fetch

    try {
        const uploadBody = Readable.from(['hello-', 'stream'])
        const response = await mediaTransfer.uploadStream({
            url: `http://127.0.0.1:${address.port}/upload-agent-proxy`,
            method: 'POST',
            contentType: 'text/plain',
            body: uploadBody
        })

        assert.equal(response.status, 201)
        assert.equal(response.ok, true)
        assert.equal(fetchCalled, false)
        assert.equal(receivedMethods[0], 'POST')
        assert.equal(receivedContentTypes[0], 'text/plain')
        assert.equal(receivedBodies[0], 'hello-stream')

        const ack = await mediaTransfer.readResponseBytes(response)
        assert.equal(new TextDecoder().decode(ack), 'upload-ok')
    } finally {
        globalThis.fetch = originalFetch
        proxyAgent.destroy()
        await new Promise<void>((resolve) => {
            server.close(() => resolve())
        })
    }
})
