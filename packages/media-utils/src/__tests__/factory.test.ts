import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { describe, it } from 'node:test'

import sharpLib from 'sharp'

import { createMediaProcessor } from '../index'

function hasFFmpeg(): boolean {
    try {
        execFileSync('ffmpeg', ['-version'], { stdio: 'ignore', timeout: 5_000 })
        return true
    } catch {
        return false
    }
}

function hasFFprobe(): boolean {
    try {
        execFileSync('ffprobe', ['-version'], { stdio: 'ignore', timeout: 5_000 })
        return true
    } catch {
        return false
    }
}

function generateTestVideo(): Uint8Array {
    const buf = execFileSync(
        'ffmpeg',
        [
            '-f',
            'lavfi',
            '-i',
            'color=c=red:s=320x240:d=1',
            '-frames:v',
            '1',
            '-f',
            'mp4',
            '-movflags',
            'frag_keyframe+empty_moov',
            'pipe:1'
        ],
        { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 }
    )
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

function createTempPath(suffix: string): string {
    return join(
        tmpdir(),
        `zapo-media-utils-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`
    )
}

async function writeTempVideoFile(): Promise<string> {
    const filePath = createTempPath('.mp4')
    await writeFile(filePath, generateTestVideo())
    return filePath
}

function createTempAudioFile(): string {
    const filePath = createTempPath('.wav')
    execFileSync(
        'ffmpeg',
        ['-f', 'lavfi', '-i', 'sine=frequency=1000:duration=1', '-y', filePath],
        { stdio: 'ignore', timeout: 10_000 }
    )
    return filePath
}

async function createTestImage(width: number, height: number): Promise<Uint8Array> {
    const buf = await sharpLib({
        create: { width, height, channels: 3, background: { r: 128, g: 64, b: 32 } }
    })
        .jpeg()
        .toBuffer()
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
}

describe('createMediaProcessor', () => {
    it('returns an object with all processor methods', () => {
        const processor = createMediaProcessor()
        assert.equal(typeof processor.generateImageThumbnail, 'function')
        assert.equal(typeof processor.generateVideoThumbnail, 'function')
        assert.equal(typeof processor.probeMedia, 'function')
        assert.equal(typeof processor.computeWaveform, 'function')
    })

    it('generateImageThumbnail respects options override', async () => {
        const processor = createMediaProcessor({
            imageThumbMaxEdge: 100,
            imageThumbQuality: 50
        })
        const img = await createTestImage(800, 600)
        const result = await processor.generateImageThumbnail!(img, 320)
        assert.ok(result.width <= 100)
        assert.ok(result.height <= 100)
    })

    it('generateStickerThumbnail returns a PNG thumbnail within max edge', async () => {
        const processor = createMediaProcessor()
        const img = await createTestImage(512, 256)
        const result = await processor.generateStickerThumbnail!(img, 96)
        assert.ok(result.pngThumbnail.byteLength > 0)
        assert.ok(result.width <= 96)
        assert.ok(result.height <= 96)
        assert.equal(result.pngThumbnail[0], 0x89)
        assert.equal(result.pngThumbnail[1], 0x50)
    })

    it('probeMedia returns empty object for unknown format without ffmpeg', async () => {
        const processor = createMediaProcessor()
        const result = await processor.probeMedia!(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]))
        assert.deepEqual(result, {})
    })

    it('computeWaveform returns null when ffmpeg is not available or input is empty', async () => {
        const processor = createMediaProcessor({ waveformPoints: 32 })
        const result = await processor.computeWaveform!(new Uint8Array(0))
        assert.equal(result, null)
    })

    it(
        'probeMedia supports file path input and valid ffprobe after a prior missing-bin probe',
        { skip: !hasFFprobe() },
        async () => {
            const videoPath = await writeTempVideoFile()
            try {
                const missingProcessor = createMediaProcessor({
                    ffprobePath: `missing-ffprobe-${Date.now()}`
                })
                const missingResult = await missingProcessor.probeMedia!(videoPath)
                assert.deepEqual(missingResult, {})

                const processor = createMediaProcessor({ ffprobePath: 'ffprobe' })
                const result = await processor.probeMedia!(videoPath)
                assert.equal(result.width, 320)
                assert.equal(result.height, 240)
                assert.ok((result.durationSeconds ?? 0) > 0)
            } finally {
                await unlink(videoPath).catch(() => undefined)
            }
        }
    )

    it(
        'computeWaveform supports file path input and clamps waveform points after a prior missing-bin probe',
        { skip: !hasFFmpeg() },
        async () => {
            const audioPath = createTempAudioFile()
            try {
                const missingProcessor = createMediaProcessor({
                    ffmpegPath: `missing-ffmpeg-${Date.now()}`,
                    waveformPoints: 32
                })
                const missingResult = await missingProcessor.computeWaveform!(audioPath)
                assert.equal(missingResult, null)

                const processor = createMediaProcessor({
                    ffmpegPath: 'ffmpeg',
                    waveformPoints: 32
                })
                const result = await processor.computeWaveform!(audioPath)
                assert.notEqual(result, null)
                assert.equal(result!.waveform.length, 64)
                assert.ok(result!.durationSeconds > 0.9)
                assert.ok(result!.durationSeconds < 1.1)
            } finally {
                await unlink(audioPath).catch(() => undefined)
            }
        }
    )

    it('cleans temp files when probing a failing stream', { skip: !hasFFprobe() }, async () => {
        const before = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('zapo-tmp-')))
        const processor = createMediaProcessor({ ffprobePath: 'ffprobe' })

        const failing = new Readable({
            read() {
                this.push(Buffer.from([1, 2, 3]))
                this.destroy(new Error('forced stream failure'))
            }
        })

        await assert.rejects(() => processor.probeMedia!(failing), /forced stream failure/)

        const after = readdirSync(tmpdir()).filter((name) => name.startsWith('zapo-tmp-'))
        const leaked = after.filter((name) => !before.has(name))

        try {
            assert.deepEqual(leaked, [])
        } finally {
            await Promise.all(
                leaked.map((name) => unlink(join(tmpdir(), name)).catch(() => undefined))
            )
        }
    })

    it('generateVideoThumbnail extracts first frame as JPEG', { skip: !hasFFmpeg() }, async () => {
        const processor = createMediaProcessor()
        const video = generateTestVideo()
        const result = await processor.generateVideoThumbnail!(video, 160)
        assert.notEqual(result, null)
        assert.ok(result!.jpegThumbnail.byteLength > 0)
        assert.equal(result!.jpegThumbnail[0], 0xff)
        assert.equal(result!.jpegThumbnail[1], 0xd8)
        assert.ok(result!.width <= 160)
        assert.ok(result!.height <= 160)
        assert.ok(result!.width > 0)
        assert.ok(result!.height > 0)
    })

    it(
        'generateVideoThumbnail returns null for invalid input',
        { skip: !hasFFmpeg() },
        async () => {
            const processor = createMediaProcessor()
            const result = await processor.generateVideoThumbnail!(new Uint8Array([1, 2, 3]), 320)
            assert.equal(result, null)
        }
    )
})
