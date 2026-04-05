import { createReadStream, createWriteStream } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { WaMediaOptions } from '@client/types'
import type { Logger } from '@infra/log/types'
import type { WaSendMediaMessage } from '@message/types'
import { toBytesView } from '@util/bytes'
import { toError } from '@util/primitives'

export interface ProcessedMediaFields {
    readonly jpegThumbnail?: Uint8Array
    readonly pngThumbnail?: Uint8Array
    readonly width?: number
    readonly height?: number
    readonly seconds?: number
    readonly waveform?: Uint8Array
    readonly isAnimated?: boolean
    readonly firstFrameLength?: number
}

interface MutableProcessedMediaFields {
    jpegThumbnail?: Uint8Array
    pngThumbnail?: Uint8Array
    width?: number
    height?: number
    seconds?: number
    waveform?: Uint8Array
    isAnimated?: boolean
    firstFrameLength?: number
}

export async function readFileHead(filePath: string, bytes: number): Promise<Uint8Array> {
    const fh = await open(filePath, 'r')
    try {
        const buf = new Uint8Array(bytes)
        const { bytesRead } = await fh.read(buf, 0, bytes, 0)
        return buf.subarray(0, bytesRead)
    } finally {
        await fh.close()
    }
}

const RIFF_HEADER_SIZE = 12
const CHUNK_HEADER_SIZE = 8
const CHUNK_ID_SIZE = 4
const ANMF_ID = [0x41, 0x4e, 0x4d, 0x46]

interface WebpAnimInfo {
    readonly isAnimated: true
    readonly firstFrameLength: number
}

export function parseWebpAnimation(data: Uint8Array): WebpAnimInfo | null {
    if (data.byteLength < RIFF_HEADER_SIZE + CHUNK_HEADER_SIZE) return null
    let offset = RIFF_HEADER_SIZE
    if (
        data[offset] !== 0x56 ||
        data[offset + 1] !== 0x50 ||
        data[offset + 2] !== 0x38 ||
        data[offset + 3] !== 0x58
    ) {
        return null
    }
    // Skip VP8X chunk: 8 byte header + 10 byte payload
    offset += CHUNK_HEADER_SIZE + 10

    while (offset + CHUNK_HEADER_SIZE <= data.byteLength) {
        const isAnmf =
            data[offset] === ANMF_ID[0] &&
            data[offset + 1] === ANMF_ID[1] &&
            data[offset + 2] === ANMF_ID[2] &&
            data[offset + 3] === ANMF_ID[3]

        const sizeOffset = offset + CHUNK_ID_SIZE
        if (sizeOffset + 4 > data.byteLength) return null

        let chunkSize =
            (data[sizeOffset] |
                (data[sizeOffset + 1] << 8) |
                (data[sizeOffset + 2] << 16) |
                (data[sizeOffset + 3] << 24)) >>>
            0
        if (chunkSize % 2 !== 0) chunkSize += 1

        const nextOffset = offset + CHUNK_HEADER_SIZE + chunkSize
        if (nextOffset <= offset || nextOffset > data.byteLength) return null

        if (isAnmf) {
            return { isAnimated: true, firstFrameLength: nextOffset }
        }

        offset = nextOffset
    }
    return null
}

const IMAGE_THUMB_MAX_EDGE = 320
const VIDEO_THUMB_MAX_EDGE = 48
const STICKER_THUMB_MAX_EDGE = 100
const EMPTY_PROCESSED: ProcessedMediaFields = {}
type MediaProcessorStep = 'thumbnail' | 'probe' | 'waveform' | 'stickerThumbnail'

export function isReadableStream(value: unknown): value is Readable {
    return (
        !!value &&
        typeof value === 'object' &&
        'pipe' in value &&
        typeof (value as Readable).pipe === 'function'
    )
}

async function streamToTempFile(source: Readable): Promise<string> {
    const filePath = join(
        tmpdir(),
        `zapo-media-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    try {
        await pipeline(source, createWriteStream(filePath))
    } catch (error) {
        await unlink(filePath).catch(() => undefined)
        throw error
    }
    return filePath
}

export async function cleanupTempFile(filePath: string): Promise<void> {
    await unlink(filePath).catch(() => undefined)
}

export interface ResolvedMediaInputs {
    readonly processorInput?: Uint8Array | string
    readonly uploadMedia: Uint8Array | Readable
    readonly tempFilePath?: string
}

export async function resolveMediaInputs(
    shouldProcess: boolean,
    raw: Uint8Array | ArrayBuffer | Readable | string
): Promise<ResolvedMediaInputs> {
    if (typeof raw === 'string') {
        return {
            processorInput: raw,
            uploadMedia: createReadStream(raw)
        }
    }
    if (isReadableStream(raw)) {
        if (shouldProcess) {
            const tempFilePath = await streamToTempFile(raw)
            return {
                processorInput: tempFilePath,
                uploadMedia: createReadStream(tempFilePath),
                tempFilePath
            }
        }
        return { uploadMedia: raw }
    }
    const bytes = toBytesView(raw)
    return { processorInput: bytes, uploadMedia: bytes }
}

function shouldGenerateThumbnail(
    media: WaMediaOptions | undefined,
    content: WaSendMediaMessage
): boolean {
    if (!media?.processor || media.generateThumbnail === false) {
        return false
    }

    switch (content.type) {
        case 'image':
            return content.jpegThumbnail === undefined && !!media.processor.generateImageThumbnail
        case 'video':
        case 'ptv':
            return content.jpegThumbnail === undefined && !!media.processor.generateVideoThumbnail
        case 'document':
            return !!media.processor.generateImageThumbnail
        default:
            return false
    }
}

function shouldProbeMedia(media: WaMediaOptions | undefined, content: WaSendMediaMessage): boolean {
    if (!media?.processor?.probeMedia || media.generateProbe === false) {
        return false
    }

    switch (content.type) {
        case 'video':
        case 'ptv':
            return (
                content.seconds === undefined ||
                content.width === undefined ||
                content.height === undefined
            )
        case 'audio':
            return content.seconds === undefined
        default:
            return false
    }
}

function shouldGenerateWaveform(
    media: WaMediaOptions | undefined,
    content: WaSendMediaMessage
): boolean {
    return (
        !!media?.processor?.computeWaveform &&
        media.generateWaveform !== false &&
        content.type === 'audio' &&
        content.waveform === undefined
    )
}

function shouldGenerateStickerThumbnail(
    media: WaMediaOptions | undefined,
    content: WaSendMediaMessage
): boolean {
    return (
        !!media?.processor?.generateStickerThumbnail &&
        media.generateStickerThumbnail !== false &&
        content.type === 'sticker' &&
        content.pngThumbnail === undefined
    )
}

export function hasMediaProcessingTasks(
    media: WaMediaOptions | undefined,
    content: WaSendMediaMessage
): boolean {
    return (
        shouldGenerateThumbnail(media, content) ||
        shouldProbeMedia(media, content) ||
        shouldGenerateWaveform(media, content) ||
        shouldGenerateStickerThumbnail(media, content)
    )
}

async function runProcessorStep<T>(
    step: MediaProcessorStep,
    content: WaSendMediaMessage,
    logger: Logger,
    fn: () => Promise<T>
): Promise<T | null> {
    try {
        return await fn()
    } catch (error) {
        logger.error('media processor step failed, skipping step', {
            type: content.type,
            step,
            message: toError(error).message
        })
        return null
    }
}

export async function runMediaProcessor(
    media: WaMediaOptions | undefined,
    input: Uint8Array | string | undefined,
    content: WaSendMediaMessage,
    logger: Logger
): Promise<ProcessedMediaFields> {
    const processor = media?.processor
    if (!processor || !hasMediaProcessingTasks(media, content) || !input) return EMPTY_PROCESSED

    const result: MutableProcessedMediaFields = {}

    const isVideo = content.type === 'video' || content.type === 'ptv'
    const thumbFn = isVideo ? processor.generateVideoThumbnail : processor.generateImageThumbnail
    const thumbMaxEdge = isVideo ? VIDEO_THUMB_MAX_EDGE : IMAGE_THUMB_MAX_EDGE

    const thumbTask = shouldGenerateThumbnail(media, content)
        ? runProcessorStep('thumbnail', content, logger, () => thumbFn!(input, thumbMaxEdge))
        : null

    const probeTask = shouldProbeMedia(media, content)
        ? runProcessorStep('probe', content, logger, () => processor.probeMedia!(input))
        : null

    const [thumb, probe] = await Promise.all([thumbTask, probeTask])

    if (thumb) {
        result.jpegThumbnail = thumb.jpegThumbnail
        if (!isVideo && !probe) {
            result.width = thumb.width
            result.height = thumb.height
        }
    }

    if (probe) {
        if (
            probe.durationSeconds !== undefined &&
            !('seconds' in content && content.seconds !== undefined)
        ) {
            result.seconds = Math.floor(probe.durationSeconds)
        }
        if (!('width' in content && content.width !== undefined) && probe.width !== undefined) {
            result.width = probe.width
        }
        if (!('height' in content && content.height !== undefined) && probe.height !== undefined) {
            result.height = probe.height
        }
    }

    if (shouldGenerateWaveform(media, content)) {
        const waveformResult = await runProcessorStep('waveform', content, logger, () =>
            processor.computeWaveform!(input)
        )
        if (waveformResult) {
            result.waveform = waveformResult.waveform
            if (
                result.seconds === undefined &&
                !('seconds' in content && content.seconds !== undefined)
            ) {
                result.seconds = Math.floor(waveformResult.durationSeconds)
            }
        }
    }

    if (content.type === 'sticker') {
        if (shouldGenerateStickerThumbnail(media, content)) {
            const stickerThumb = await runProcessorStep('stickerThumbnail', content, logger, () =>
                processor.generateStickerThumbnail!(input, STICKER_THUMB_MAX_EDGE)
            )
            if (stickerThumb) {
                result.pngThumbnail = stickerThumb.pngThumbnail
                result.width = stickerThumb.width
                result.height = stickerThumb.height
            }
        }
        if (content.isAnimated === undefined) {
            const header = typeof input === 'string' ? await readFileHead(input, 100) : input
            const anim = parseWebpAnimation(header)
            if (anim) {
                result.isAnimated = true
                result.firstFrameLength = anim.firstFrameLength
            } else {
                result.isAnimated = false
            }
        }
    }

    return result
}
