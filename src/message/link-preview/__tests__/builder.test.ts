import assert from 'node:assert/strict'
import test from 'node:test'

import { buildExtendedTextWithPreview } from '@message/link-preview/builder'
import { proto } from '@proto'

test('buildExtendedTextWithPreview sets matchedText, title, description, previewType', () => {
    const msg = buildExtendedTextWithPreview(
        'check https://example.com',
        {
            matchedText: 'https://example.com',
            title: 'Example',
            description: 'An example site',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
        },
        {}
    )
    assert.equal(msg.extendedTextMessage?.text, 'check https://example.com')
    assert.equal(msg.extendedTextMessage?.matchedText, 'https://example.com')
    assert.equal(msg.extendedTextMessage?.title, 'Example')
    assert.equal(msg.extendedTextMessage?.description, 'An example site')
    assert.equal(
        msg.extendedTextMessage?.previewType,
        proto.Message.ExtendedTextMessage.PreviewType.NONE
    )
})

test('buildExtendedTextWithPreview inlines jpegThumbnail bytes', () => {
    const thumb = new Uint8Array([1, 2, 3])
    const msg = buildExtendedTextWithPreview(
        'x https://example.com',
        {
            matchedText: 'https://example.com',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
        },
        { jpegThumbnail: thumb }
    )
    assert.equal(msg.extendedTextMessage?.jpegThumbnail, thumb)
    assert.equal(msg.extendedTextMessage?.thumbnailDirectPath, undefined)
})

test('buildExtendedTextWithPreview maps HQ thumbnail fields and VIDEO previewType', () => {
    const sha = new Uint8Array(32).fill(7)
    const encSha = new Uint8Array(32).fill(8)
    const mediaKey = new Uint8Array(32).fill(9)
    const msg = buildExtendedTextWithPreview(
        'x https://example.com',
        {
            matchedText: 'https://example.com',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.VIDEO
        },
        {
            thumbnailDirectPath: '/v/x',
            thumbnailSha256: sha,
            thumbnailEncSha256: encSha,
            mediaKey,
            mediaKeyTimestamp: 1234,
            thumbnailWidth: 100,
            thumbnailHeight: 200
        }
    )
    assert.equal(msg.extendedTextMessage?.thumbnailDirectPath, '/v/x')
    assert.equal(msg.extendedTextMessage?.thumbnailSha256, sha)
    assert.equal(msg.extendedTextMessage?.thumbnailEncSha256, encSha)
    assert.equal(msg.extendedTextMessage?.mediaKey, mediaKey)
    assert.equal(msg.extendedTextMessage?.mediaKeyTimestamp, 1234)
    assert.equal(msg.extendedTextMessage?.thumbnailWidth, 100)
    assert.equal(msg.extendedTextMessage?.thumbnailHeight, 200)
    assert.equal(
        msg.extendedTextMessage?.previewType,
        proto.Message.ExtendedTextMessage.PreviewType.VIDEO
    )
})

test('buildExtendedTextWithPreview omits unset optional fields', () => {
    const msg = buildExtendedTextWithPreview(
        'x https://example.com',
        {
            matchedText: 'https://example.com',
            previewType: proto.Message.ExtendedTextMessage.PreviewType.NONE
        },
        {}
    )
    assert.equal(msg.extendedTextMessage?.title, undefined)
    assert.equal(msg.extendedTextMessage?.description, undefined)
    assert.equal(msg.extendedTextMessage?.jpegThumbnail, undefined)
    assert.equal(msg.extendedTextMessage?.thumbnailDirectPath, undefined)
    assert.equal(msg.extendedTextMessage?.mediaKey, undefined)
})
