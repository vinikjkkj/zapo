import { execFile, spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type {
    WaMediaProcessorImageResult,
    WaMediaProcessorInput,
    WaMediaProcessorProbeResult,
    WaMediaProcessorWaveformResult
} from 'zapo-js/media'

import { generateImageThumbnail } from './sharp'

export type FfmpegWarnFn = (message: string) => void

const WAVEFORM_POINTS = 64
const WAVEFORM_MIN_POINTS = 64
const WAVEFORM_MAX_POINTS = 192

function inputToReadable(input: WaMediaProcessorInput): Readable {
    if (input instanceof Readable) return input
    return Readable.from([input])
}

function which(bin: string): Promise<boolean> {
    return new Promise((resolve) => {
        execFile(bin, ['-version'], { timeout: 5_000 }, (err) => resolve(!err))
    })
}

const binCache = new Map<string, boolean>()
const warnedBins = new Set<string>()

async function hasBin(path: string, label: string, warn?: FfmpegWarnFn): Promise<boolean> {
    let available = binCache.get(path)
    if (available === undefined) {
        available = await which(path)
        binCache.set(path, available)
    }
    if (!available && warn && !warnedBins.has(path)) {
        warnedBins.add(path)
        warn(`${label} not found at '${path}', related processing will be skipped`)
    }
    return available
}

export async function probeWithFfmpeg(
    input: WaMediaProcessorInput,
    ffprobePath?: string,
    warn?: FfmpegWarnFn
): Promise<WaMediaProcessorProbeResult | null> {
    const bin = ffprobePath ?? 'ffprobe'
    if (!(await hasBin(bin, 'ffprobe', warn))) return null

    let filePath: string
    let needsCleanup: boolean

    if (typeof input === 'string') {
        filePath = input
        needsCleanup = false
    } else {
        filePath = await inputToTempFile(input)
        needsCleanup = true
    }

    try {
        const args = [
            '-v',
            'quiet',
            '-print_format',
            'json',
            '-show_format',
            '-show_streams',
            filePath
        ]

        return await new Promise<WaMediaProcessorProbeResult | null>((resolve) => {
            execFile(bin, args, { timeout: 10_000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
                if (err || !stdout) {
                    resolve(null)
                    return
                }
                try {
                    const data = JSON.parse(stdout) as {
                        format?: { duration?: string }
                        streams?: readonly {
                            width?: number
                            height?: number
                            codec_type?: string
                        }[]
                    }
                    const videoStream = data.streams?.find((s) => s.codec_type === 'video')
                    resolve({
                        durationSeconds: data.format?.duration
                            ? parseFloat(data.format.duration)
                            : undefined,
                        width: videoStream?.width,
                        height: videoStream?.height
                    })
                } catch {
                    resolve(null)
                }
            })
        })
    } finally {
        if (needsCleanup) {
            await unlink(filePath).catch(() => undefined)
        }
    }
}

async function inputToTempFile(input: Uint8Array | Readable): Promise<string> {
    const path = join(tmpdir(), `zapo-tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    let output: ReturnType<typeof createWriteStream> | undefined
    try {
        if (input instanceof Uint8Array) {
            await writeFile(path, input)
            return path
        }

        output = createWriteStream(path)
        await pipeline(input, output)
        return path
    } catch (error) {
        if (output && !output.closed) {
            await new Promise<void>((resolve) => {
                output!.once('close', resolve)
                output!.destroy()
            })
        }
        await unlink(path).catch(() => undefined)
        throw error
    }
}

export async function generateVideoThumbnailWithFfmpeg(
    input: WaMediaProcessorInput,
    maxEdge: number,
    ffmpegPath?: string,
    warn?: FfmpegWarnFn
): Promise<WaMediaProcessorImageResult | null> {
    const bin = ffmpegPath ?? 'ffmpeg'
    if (!(await hasBin(bin, 'ffmpeg', warn))) return null

    let filePath: string
    let needsCleanup: boolean

    if (typeof input === 'string') {
        filePath = input
        needsCleanup = false
    } else {
        filePath = await inputToTempFile(input)
        needsCleanup = true
    }

    try {
        const args = ['-i', filePath, '-frames:v', '1', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1']

        return await new Promise((resolve, reject) => {
            const proc = spawn(bin, args, {
                stdio: ['ignore', 'pipe', 'ignore'],
                timeout: 15_000
            })

            const thumbPromise = generateImageThumbnail(proc.stdout, maxEdge)

            thumbPromise.then((result) => resolve(result)).catch(() => resolve(null))

            proc.on('error', (err) => reject(err))
        })
    } finally {
        if (needsCleanup) {
            await unlink(filePath).catch(() => undefined)
        }
    }
}

const SAMPLES_PER_RAW_BUCKET = 125
const BYTES_PER_SAMPLE = 4

export async function computeWaveformWithFfmpeg(
    input: WaMediaProcessorInput,
    ffmpegPath?: string,
    points?: number,
    warn?: FfmpegWarnFn
): Promise<WaMediaProcessorWaveformResult | null> {
    const bin = ffmpegPath ?? 'ffmpeg'
    if (!(await hasBin(bin, 'ffmpeg', warn))) return null

    const useFile = typeof input === 'string'
    const args = [
        '-i',
        useFile ? input : 'pipe:0',
        '-f',
        'f32le',
        '-ac',
        '1',
        '-ar',
        '8000',
        'pipe:1'
    ]
    const targetPoints = Math.max(
        WAVEFORM_MIN_POINTS,
        Math.min(points ?? WAVEFORM_POINTS, WAVEFORM_MAX_POINTS)
    )

    return new Promise((resolve, reject) => {
        const proc = spawn(bin, args, {
            stdio: [useFile ? 'ignore' : 'pipe', 'pipe', 'ignore'],
            timeout: 30_000
        })

        const rawBuckets: number[] = []
        let bucketSum = 0
        let bucketCount = 0
        let totalSamples = 0
        let leftover = new Uint8Array(0)

        proc.stdout!.on('data', (chunk: Buffer) => {
            let offset = 0

            if (leftover.byteLength > 0) {
                const need = BYTES_PER_SAMPLE - leftover.byteLength
                if (chunk.byteLength < need) {
                    const merged = new Uint8Array(leftover.byteLength + chunk.byteLength)
                    merged.set(leftover, 0)
                    merged.set(chunk, leftover.byteLength)
                    leftover = merged
                    return
                }
                const merged = new Uint8Array(BYTES_PER_SAMPLE)
                merged.set(leftover, 0)
                merged.set(chunk.subarray(0, need), leftover.byteLength)
                const view = new DataView(merged.buffer, 0, BYTES_PER_SAMPLE)
                bucketSum += Math.abs(view.getFloat32(0, true))
                bucketCount++
                totalSamples++
                if (bucketCount >= SAMPLES_PER_RAW_BUCKET) {
                    rawBuckets.push(bucketSum / bucketCount)
                    bucketSum = 0
                    bucketCount = 0
                }
                offset = need
                leftover = new Uint8Array(0)
            }

            const remaining = chunk.byteLength - offset
            const alignedLen = Math.floor(remaining / BYTES_PER_SAMPLE) * BYTES_PER_SAMPLE

            for (let i = 0; i < alignedLen; i += BYTES_PER_SAMPLE) {
                bucketSum += Math.abs(chunk.readFloatLE(offset + i))
                bucketCount++
                totalSamples++
                if (bucketCount >= SAMPLES_PER_RAW_BUCKET) {
                    rawBuckets.push(bucketSum / bucketCount)
                    bucketSum = 0
                    bucketCount = 0
                }
            }

            const tail = remaining - alignedLen
            if (tail > 0) {
                leftover = new Uint8Array(
                    chunk.subarray(offset + alignedLen, offset + alignedLen + tail)
                )
            }
        })

        proc.on('error', (err) => reject(err))

        proc.on('close', (code) => {
            if (bucketCount > 0) {
                rawBuckets.push(bucketSum / bucketCount)
            }
            if (rawBuckets.length === 0 || code !== 0) {
                resolve(null)
                return
            }
            const SAMPLE_RATE = 8000
            resolve({
                waveform: scaleAndNormalize(rawBuckets, targetPoints),
                durationSeconds: totalSamples / SAMPLE_RATE
            })
        })

        if (!useFile) {
            const stream = inputToReadable(input)
            proc.stdin!.on('error', () => stream.destroy())
            stream.pipe(proc.stdin!)
            stream.on('error', (err) => {
                proc.kill()
                reject(err)
            })
        }
    })
}

function scaleAndNormalize(raw: number[], points: number): Uint8Array {
    const scaled = new Float32Array(points)
    if (raw.length <= points) {
        if (raw.length === 1) {
            scaled.fill(raw[0])
        } else {
            for (let i = 0; i < points; i++) {
                const pos = (i / (points - 1)) * (raw.length - 1)
                const lo = Math.floor(pos)
                const hi = Math.ceil(pos)
                const frac = pos - lo
                scaled[i] = raw[lo] + (raw[hi] - raw[lo]) * frac
            }
        }
    } else {
        const bucketSize = raw.length / points
        for (let i = 0; i < points; i++) {
            const start = Math.floor(i * bucketSize)
            const end = Math.floor((i + 1) * bucketSize)
            let sum = 0
            for (let j = start; j < end; j++) sum += raw[j]
            scaled[i] = sum / (end - start)
        }
    }

    let max = 0
    for (let i = 0; i < points; i++) {
        if (scaled[i] > max) max = scaled[i]
    }

    const waveform = new Uint8Array(points)
    if (max > 0) {
        for (let i = 0; i < points; i++) {
            waveform[i] = Math.round((scaled[i] / max) * 100)
        }
    }
    return waveform
}
