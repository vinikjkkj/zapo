import assert from 'node:assert/strict'
import test from 'node:test'

import { resolveMediaPayload } from '@message/encode/media-payload'

const key = new Uint8Array([1, 2, 3])
const sha = new Uint8Array([4, 5, 6])
const encSha = new Uint8Array([7, 8, 9])

test('resolveMediaPayload returns null when message is empty or has no media', () => {
    assert.equal(resolveMediaPayload(null), null)
    assert.equal(resolveMediaPayload(undefined), null)
    assert.equal(resolveMediaPayload({}), null)
    assert.equal(resolveMediaPayload({ conversation: 'hi' }), null)
})

test('resolveMediaPayload returns null when directPath or mediaKey is missing', () => {
    assert.equal(resolveMediaPayload({ imageMessage: { mediaKey: key } }), null)
    assert.equal(resolveMediaPayload({ imageMessage: { directPath: '/x' } }), null)
})

test('resolveMediaPayload maps image and document', () => {
    const img = resolveMediaPayload({
        imageMessage: {
            directPath: '/img',
            mediaKey: key,
            fileSha256: sha,
            fileEncSha256: encSha,
            mimetype: 'image/jpeg',
            fileLength: 1234
        }
    })
    assert.deepEqual(img, {
        mediaType: 'image',
        directPath: '/img',
        mediaKey: key,
        fileSha256: sha,
        fileEncSha256: encSha,
        mimetype: 'image/jpeg',
        fileLength: 1234
    })

    const doc = resolveMediaPayload({
        documentMessage: { directPath: '/doc', mediaKey: key }
    })
    assert.equal(doc?.mediaType, 'document')
    assert.equal(doc?.directPath, '/doc')
    assert.equal(doc?.fileLength, undefined)
})

test('resolveMediaPayload distinguishes video/gif and audio/ptt and ptv', () => {
    const video = resolveMediaPayload({
        videoMessage: { directPath: '/v', mediaKey: key }
    })
    assert.equal(video?.mediaType, 'video')

    const gif = resolveMediaPayload({
        videoMessage: { directPath: '/v', mediaKey: key, gifPlayback: true }
    })
    assert.equal(gif?.mediaType, 'gif')

    const audio = resolveMediaPayload({
        audioMessage: { directPath: '/a', mediaKey: key }
    })
    assert.equal(audio?.mediaType, 'audio')

    const ptt = resolveMediaPayload({
        audioMessage: { directPath: '/a', mediaKey: key, ptt: true }
    })
    assert.equal(ptt?.mediaType, 'ptt')

    const ptv = resolveMediaPayload({
        ptvMessage: { directPath: '/ptv', mediaKey: key }
    })
    assert.equal(ptv?.mediaType, 'ptv')

    const sticker = resolveMediaPayload({
        stickerMessage: { directPath: '/s', mediaKey: key }
    })
    assert.equal(sticker?.mediaType, 'sticker')
})

test('resolveMediaPayload unwraps ephemeral/viewOnce/documentWithCaption wrappers', () => {
    const wrapped = resolveMediaPayload({
        ephemeralMessage: {
            message: {
                imageMessage: { directPath: '/img', mediaKey: key }
            }
        }
    })
    assert.equal(wrapped?.mediaType, 'image')

    const wrappedDoc = resolveMediaPayload({
        documentWithCaptionMessage: {
            message: {
                documentMessage: { directPath: '/d', mediaKey: key }
            }
        }
    })
    assert.equal(wrappedDoc?.mediaType, 'document')

    const wrappedViewOnce = resolveMediaPayload({
        viewOnceMessageV2: {
            message: {
                videoMessage: { directPath: '/v', mediaKey: key, gifPlayback: true }
            }
        }
    })
    assert.equal(wrappedViewOnce?.mediaType, 'gif')
})

test('resolveMediaPayload converts protobuf Long fileLength via toNumber', () => {
    const payload = resolveMediaPayload({
        imageMessage: {
            directPath: '/img',
            mediaKey: key,
            fileLength: { toNumber: () => 9876 } as unknown as number
        }
    })
    assert.equal(payload?.fileLength, 9876)
})
