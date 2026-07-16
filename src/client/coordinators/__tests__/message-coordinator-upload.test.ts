import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import test from 'node:test'

import { WaMessageCoordinator } from '@client/coordinators/WaMessageCoordinator'
import type { WaMediaMessageOptions } from '@client/messaging/messages'
import { sha256 } from '@crypto'
import { createNoopLogger } from '@infra/log/types'
import { WaMediaCrypto } from '@media/crypto/WaMediaCrypto'
import { readAllBytes, TEXT_ENCODER } from '@util/bytes'

interface CapturedUpload {
    url?: string
    method?: string
    contentType?: string
    contentLength?: number
    body?: Uint8Array
    timeoutMs?: number
}

const SERVER_NOW_SECONDS = 4242

function fakeMediaUploadOptions(
    captured: CapturedUpload,
    response: unknown = { url: 'https://cdn/enc', direct_path: '/v/enc' }
): { readonly options: WaMediaMessageOptions; readonly queryCalls: () => number } {
    let queryCalls = 0
    const mediaTransfer = {
        uploadStream: async (req: {
            readonly url: string
            readonly method?: string
            readonly body: Uint8Array | Readable
            readonly contentLength?: number
            readonly contentType?: string
            readonly timeoutMs?: number
        }) => {
            captured.url = req.url
            captured.method = req.method
            captured.contentType = req.contentType
            captured.contentLength = req.contentLength
            captured.timeoutMs = req.timeoutMs
            captured.body = req.body instanceof Uint8Array ? req.body : await readAllBytes(req.body)
            return { url: req.url, status: 200, ok: true, headers: {}, body: null }
        },
        readResponseBytes: async () => TEXT_ENCODER.encode(JSON.stringify(response))
    }
    const options = {
        logger: createNoopLogger(),
        mediaTransfer,
        getMediaConnCache: () => ({
            auth: 'AUTH-TOKEN',
            expiresAtMs: Date.now() + 3_600_000,
            hosts: [
                { hostname: 'mmg-fallback.whatsapp.net', isFallback: true },
                { hostname: 'mmg.whatsapp.net', isFallback: false }
            ]
        }),
        setMediaConnCache: () => undefined,
        queryWithContext: async () => {
            queryCalls += 1
            throw new Error('media_conn should not be queried when the cache is fresh')
        },
        serverClock: {
            nowSeconds: () => SERVER_NOW_SECONDS,
            nowMs: () => SERVER_NOW_SECONDS * 1000
        }
    } as unknown as WaMediaMessageOptions
    return { options, queryCalls: () => queryCalls }
}

function createUploadCoordinator(mediaUploadOptions: WaMediaMessageOptions): WaMessageCoordinator {
    return new WaMessageCoordinator({
        messageDispatch: {} as never,
        mediaTransfer: {} as never,
        mediaUploadOptions,
        logger: createNoopLogger(),
        messageStore: {} as never,
        messageSecretStore: {} as never,
        trustedContactToken: {} as never,
        emitAddon: () => undefined,
        mexSocket: { query: async () => ({ tag: 'iq', attrs: { type: 'result' } }) },
        peerDataOperation: {} as never
    })
}

test('upload encrypts image bytes, targets the non-fallback host + type path, echoes descriptor', async () => {
    const captured: CapturedUpload = {}
    const { options } = fakeMediaUploadOptions(captured)
    const coordinator = createUploadCoordinator(options)
    const plaintext = TEXT_ENCODER.encode('hello media payload')

    const result = await coordinator.upload(plaintext, { type: 'image', mimetype: 'image/jpeg' })

    assert.match(captured.url ?? '', /^https:\/\/mmg\.whatsapp\.net\/mms\/image\//)
    assert.match(captured.url ?? '', /auth=AUTH-TOKEN/)
    assert.equal(captured.method, 'POST')
    assert.equal(captured.contentType, 'image/jpeg')

    assert.equal(result.url, 'https://cdn/enc')
    assert.equal(result.directPath, '/v/enc')
    assert.equal(result.mimetype, 'image/jpeg')
    assert.equal(result.mediaKeyTimestamp, SERVER_NOW_SECONDS)
    assert.equal(result.mediaKey.byteLength, 32)
    assert.equal(result.fileLength, plaintext.byteLength)
    assert.deepEqual(result.fileSha256, sha256(plaintext))
    assert.equal(result.streamingSidecar, undefined)

    const roundTrip = await WaMediaCrypto.decryptBytes(
        'image',
        result.mediaKey,
        captured.body!,
        result.fileSha256,
        result.fileEncSha256
    )
    assert.deepEqual(roundTrip.plaintext, plaintext)
})

test('upload defaults the streaming sidecar on for video and forwards timeout', async () => {
    const captured: CapturedUpload = {}
    const { options } = fakeMediaUploadOptions(captured)
    const coordinator = createUploadCoordinator(options)

    const result = await coordinator.upload(TEXT_ENCODER.encode('a video body'), {
        type: 'video',
        mimetype: 'video/mp4',
        timeoutMs: 9_999
    })

    assert.match(captured.url ?? '', /\/mms\/video\//)
    assert.equal(captured.timeoutMs, 9_999)
    assert.ok(result.streamingSidecar && result.streamingSidecar.byteLength > 0)
})

test('upload accepts a readable stream source and reports the plaintext length', async () => {
    const captured: CapturedUpload = {}
    const { options } = fakeMediaUploadOptions(captured)
    const coordinator = createUploadCoordinator(options)
    const payload = TEXT_ENCODER.encode('streamed document bytes')

    const result = await coordinator.upload(Readable.from([payload]), {
        type: 'document',
        mimetype: 'application/pdf'
    })

    assert.match(captured.url ?? '', /\/mms\/document\//)
    assert.equal(result.fileLength, payload.byteLength)
    const roundTrip = await WaMediaCrypto.decryptBytes(
        'document',
        result.mediaKey,
        captured.body!,
        result.fileSha256,
        result.fileEncSha256
    )
    assert.deepEqual(roundTrip.plaintext, payload)
})

test('upload reuses a caller-supplied media key', async () => {
    const captured: CapturedUpload = {}
    const { options } = fakeMediaUploadOptions(captured)
    const coordinator = createUploadCoordinator(options)
    const mediaKey = await WaMediaCrypto.generateMediaKey()

    const result = await coordinator.upload(TEXT_ENCODER.encode('x'), {
        type: 'image',
        mimetype: 'image/png',
        mediaKey
    })

    assert.deepEqual(result.mediaKey, mediaKey)
})

test('upload rejects an unsupported source type', async () => {
    const captured: CapturedUpload = {}
    const { options } = fakeMediaUploadOptions(captured)
    const coordinator = createUploadCoordinator(options)

    await assert.rejects(
        () => coordinator.upload({ not: 'a source' } as never, { type: 'image' }),
        /unsupported source type/
    )
})
