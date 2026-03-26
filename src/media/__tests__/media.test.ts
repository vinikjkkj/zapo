import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import { Readable } from 'node:stream'
import test from 'node:test'

import { buildMediaMessageContent, getMediaConn } from '@client/messages'
import type { Logger } from '@infra/log/types'
import { parseMediaConnResponse } from '@media/conn'
import { WaMediaCrypto } from '@media/WaMediaCrypto'
import { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import type { BinaryNode, WaProxyDispatcher } from '@transport/types'

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
    assert.equal(uploadedRequests.length, 1)
    assert.match(uploadedRequests[0].url, /\/mms\/video\//)
    assert.match(uploadedRequests[0].url, /auth=auth-token/)
    assert.match(uploadedRequests[0].url, /token=/)
    assert.ok((uploadedRequests[0].contentLength ?? 0) > 0)
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

test('media transfer client applies separate upload/download dispatchers', async () => {
    const downloadDispatcher: WaProxyDispatcher = {
        dispatch: () => undefined
    }
    const uploadDispatcher: WaProxyDispatcher = {
        dispatch: () => undefined
    }
    const seenDispatchers: unknown[] = []
    const originalFetch = globalThis.fetch

    globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
        const withDispatcher = init as RequestInit & { readonly dispatcher?: unknown }
        seenDispatchers.push(withDispatcher.dispatcher)
        return new Response('ok', { status: 200 })
    }) as typeof fetch

    try {
        const mediaTransfer = new WaMediaTransferClient({
            defaultUploadDispatcher: uploadDispatcher,
            defaultDownloadDispatcher: downloadDispatcher
        })
        await mediaTransfer.downloadStream({
            url: 'https://example.com/download'
        })
        await mediaTransfer.uploadStream({
            url: 'https://example.com/upload',
            body: new Uint8Array([1, 2, 3])
        })
    } finally {
        globalThis.fetch = originalFetch
    }

    assert.equal(seenDispatchers.length, 2)
    assert.equal(seenDispatchers[0], downloadDispatcher)
    assert.equal(seenDispatchers[1], uploadDispatcher)
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
