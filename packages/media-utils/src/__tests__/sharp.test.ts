import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'

import sharpLib from 'sharp'

import { generateImageThumbnail } from '../sharp'

async function createTestImage(width: number, height: number): Promise<Uint8Array> {
    const buf = await sharpLib({
        create: { width, height, channels: 3, background: { r: 128, g: 64, b: 32 } }
    })
        .jpeg()
        .toBuffer()
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

describe('generateImageThumbnail', () => {
    it('resizes image within max edge and returns JPEG', async () => {
        const img = await createTestImage(1920, 1080)
        const result = await generateImageThumbnail(img, 320)
        assert.ok(result.jpegThumbnail.byteLength > 0)
        assert.ok(result.width <= 320)
        assert.ok(result.height <= 320)
        assert.ok(result.width > 0)
        assert.ok(result.height > 0)
        // JPEG magic bytes
        assert.equal(result.jpegThumbnail[0], 0xff)
        assert.equal(result.jpegThumbnail[1], 0xd8)
    })

    it('does not enlarge small images', async () => {
        const img = await createTestImage(100, 80)
        const result = await generateImageThumbnail(img, 320)
        assert.equal(result.width, 100)
        assert.equal(result.height, 80)
    })

    it('works with Readable stream input', async () => {
        const img = await createTestImage(640, 480)
        const stream = Readable.from([img])
        const result = await generateImageThumbnail(stream, 200)
        assert.ok(result.jpegThumbnail.byteLength > 0)
        assert.ok(result.width <= 200)
        assert.ok(result.height <= 200)
    })
})
