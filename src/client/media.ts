import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { open, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Readable, Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import type { WaDownloadMediaOptions, WaIncomingMessageEvent, WaMediaOptions } from '@client/types'
import { randomIntAsync, sha256 } from '@crypto/core'
import type { Logger } from '@infra/log/types'
import { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import type { WaMediaConn } from '@media/types'
import { resolveMediaPayload } from '@message/encode/media-payload'
import type { WaSendMediaMessage } from '@message/types'
import type { Proto } from '@proto'
import { toProxyAgent } from '@transport/proxy'
import type { WaProxyTransport } from '@transport/types'
import { bytesToBase64UrlSafe, TEXT_DECODER, toBytesView, toChunkBytes } from '@util/bytes'
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

const IMAGE_THUMB_MAX_EDGE = 100
const VIDEO_THUMB_MAX_EDGE = 100
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

export interface StreamFileMetrics {
    readonly fileSha256: Uint8Array
    readonly byteLength: number
}

function createSha256SizeMeter(): {
    readonly transform: Transform
    readonly finalize: () => StreamFileMetrics
} {
    const hash = createHash('sha256')
    let byteLength = 0
    const transform = new Transform({
        transform(chunk, _enc, cb) {
            const bytes = chunk instanceof Uint8Array ? chunk : toChunkBytes(chunk)
            hash.update(bytes)
            byteLength += bytes.byteLength
            cb(null, bytes)
        }
    })
    return {
        transform,
        finalize: () => ({ fileSha256: toBytesView(hash.digest()), byteLength })
    }
}

async function streamToTempFileWithSha256(
    source: Readable
): Promise<StreamFileMetrics & { readonly filePath: string }> {
    const filePath = join(
        tmpdir(),
        `zapo-media-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    const meter = createSha256SizeMeter()
    try {
        await pipeline(source, meter.transform, createWriteStream(filePath))
    } catch (error) {
        await unlink(filePath).catch(() => undefined)
        throw error
    }
    return { filePath, ...meter.finalize() }
}

export type WaUploadMediaSource = Uint8Array | string | Readable

interface PreparedPlaintextUploadSource {
    readonly fileSha256: Uint8Array
    readonly byteLength: number
    readonly body: Uint8Array | Readable
    readonly cleanup?: () => Promise<void>
}

async function preparePlaintextUploadSource(
    media: WaUploadMediaSource
): Promise<PreparedPlaintextUploadSource> {
    if (media instanceof Uint8Array) {
        return { fileSha256: sha256(media), byteLength: media.byteLength, body: media }
    }
    if (typeof media === 'string') {
        await assertReadableFile(media)
        const result = await streamToTempFileWithSha256(createReadStream(media))
        return {
            fileSha256: result.fileSha256,
            byteLength: result.byteLength,
            body: createReadStream(result.filePath),
            cleanup: () => cleanupTempFile(result.filePath)
        }
    }
    if (isReadableStream(media)) {
        const result = await streamToTempFileWithSha256(media)
        return {
            fileSha256: result.fileSha256,
            byteLength: result.byteLength,
            body: createReadStream(result.filePath),
            cleanup: () => cleanupTempFile(result.filePath)
        }
    }
    throw new Error('media upload received unsupported source type')
}

// node:crypto randomInt caps max at 2**48 - 1; well within JS safe integer range.
const MEDIA_UPLOAD_ID_MAX = 281_474_976_710_655

async function generateMediaUploadId(): Promise<string> {
    const value = await randomIntAsync(0, MEDIA_UPLOAD_ID_MAX)
    return value.toString(10)
}

export function selectMediaUploadHost(mediaConn: WaMediaConn): string {
    return mediaConn.hosts.find((host) => !host.isFallback)?.hostname ?? mediaConn.hosts[0].hostname
}

export function buildMediaUploadUrl(
    host: string,
    path: string,
    auth: string,
    fileSha256: Uint8Array,
    mediaId?: string
): string {
    const hashToken = bytesToBase64UrlSafe(fileSha256)
    const base = `https://${host}${path}/${hashToken}?auth=${encodeURIComponent(auth)}&token=${encodeURIComponent(hashToken)}`
    return mediaId !== undefined ? `${base}&media_id=${mediaId}` : base
}

export function assertMediaUploadStatus(status: number, label: string): void {
    if (status < 200 || status >= 300) {
        throw new Error(`${label} failed with status ${status}`)
    }
}

export function parseMediaUploadJsonBody<T>(body: Uint8Array, label: string): T {
    try {
        return JSON.parse(TEXT_DECODER.decode(body)) as T
    } catch (error) {
        throw new Error(`${label} returned invalid json: ${toError(error).message}`)
    }
}

export interface PlaintextMediaUploadDeps {
    readonly mediaTransfer: WaMediaTransferClient
    readonly mediaConn: WaMediaConn
    readonly logger: Logger
}

export interface PlaintextMediaUploadInput {
    readonly source: WaUploadMediaSource
    readonly path: string
    readonly mimetype?: string
    readonly logLabel?: string
}

export interface PlaintextMediaUploadResult {
    readonly responseBytes: Uint8Array
    readonly status: number
    readonly fileSha256: Uint8Array
    readonly byteLength: number
    readonly mediaId: string
}

export async function performPlaintextMediaUpload(
    deps: PlaintextMediaUploadDeps,
    input: PlaintextMediaUploadInput
): Promise<PlaintextMediaUploadResult> {
    const prepared = await preparePlaintextUploadSource(input.source)
    try {
        const host = selectMediaUploadHost(deps.mediaConn)
        const mediaId = await generateMediaUploadId()
        const url = buildMediaUploadUrl(
            host,
            input.path,
            deps.mediaConn.auth,
            prepared.fileSha256,
            mediaId
        )
        deps.logger.debug(input.logLabel ?? 'sending media upload', {
            host,
            path: input.path,
            size: prepared.byteLength
        })
        const response = await deps.mediaTransfer.uploadStream({
            url,
            method: 'POST',
            body: prepared.body,
            contentLength: prepared.byteLength,
            contentType: input.mimetype
        })
        const responseBytes = await deps.mediaTransfer.readResponseBytes(response)
        return {
            responseBytes,
            status: response.status,
            fileSha256: prepared.fileSha256,
            byteLength: prepared.byteLength,
            mediaId
        }
    } finally {
        await prepared.cleanup?.()
    }
}

export interface ResolvedMediaInputs {
    readonly processorInput?: Uint8Array | string
    readonly uploadMedia: Uint8Array | Readable
    readonly tempFilePath?: string
}

async function assertReadableFile(filePath: string): Promise<void> {
    try {
        const stats = await stat(filePath)
        if (!stats.isFile()) {
            throw new Error(`media path is not a regular file: ${filePath}`)
        }
    } catch (error) {
        const err = toError(error)
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            throw new Error(`media file not found: ${filePath}`)
        }
        throw err
    }
}

export async function resolveMediaInputs(
    shouldProcess: boolean,
    raw: Uint8Array | ArrayBuffer | Readable | string
): Promise<ResolvedMediaInputs> {
    if (typeof raw === 'string') {
        await assertReadableFile(raw)
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

export function shouldNormalizeVoiceNote(
    media: WaMediaOptions | undefined,
    content: WaSendMediaMessage
): content is WaSendMediaMessage & { type: 'audio' } {
    return (
        !!media?.processor?.normalizeVoiceNote &&
        media.normalizeVoiceNote === true &&
        content.type === 'audio' &&
        content.ptt === true
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

// Reuse one scoped child logger per parent. The processor is allowed to be
// shared across WaClient sessions; without this cache, each call would mint
// a fresh child logger and any package-side dedup keyed by Logger identity
// (e.g. ffmpeg's missing-binary warn) would reset on every send.
const SCOPED_MEDIA_LOGGER_CACHE = new WeakMap<Logger, Logger>()

export function getScopedMediaLogger(parent: Logger): Logger {
    let scoped = SCOPED_MEDIA_LOGGER_CACHE.get(parent)
    if (!scoped) {
        scoped = parent.child({ scope: 'media-utils' })
        SCOPED_MEDIA_LOGGER_CACHE.set(parent, scoped)
    }
    return scoped
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
    const ctx = { logger: getScopedMediaLogger(logger) }

    const isVideo = content.type === 'video' || content.type === 'ptv'
    const thumbFn = isVideo ? processor.generateVideoThumbnail : processor.generateImageThumbnail
    const thumbMaxEdge = isVideo ? VIDEO_THUMB_MAX_EDGE : IMAGE_THUMB_MAX_EDGE

    const thumbTask = shouldGenerateThumbnail(media, content)
        ? runProcessorStep('thumbnail', content, logger, () => thumbFn!(input, thumbMaxEdge, ctx))
        : null

    const probeTask = shouldProbeMedia(media, content)
        ? runProcessorStep('probe', content, logger, () => processor.probeMedia!(input, ctx))
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
            processor.computeWaveform!(input, ctx)
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
                processor.generateStickerThumbnail!(input, STICKER_THUMB_MAX_EDGE, ctx)
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

export interface WaDownloadMediaMessageOptions extends WaDownloadMediaOptions {
    /**
     * Reuse an existing transfer client instead of creating a fresh one. Lets
     * the download inherit proxy agents, timeouts, and the MAC-verification
     * toggle, and avoids spinning up a new HTTP client per call in a loop. A
     * stateless {@link WaMediaTransferClient} is created when omitted - fine
     * for one-off downloads.
     */
    readonly transfer?: WaMediaTransferClient
    /**
     * Proxy for the CDN download leg, mirroring `proxy.mediaDownload` on the
     * client. The fetch runs over `node:http`/`node:https`, so only the Node
     * `http.Agent` form is used; an undici dispatcher is ignored (same as the
     * client treats `mediaDownload`). Takes precedence over the default agent
     * of a `transfer` you pass.
     */
    readonly proxy?: WaProxyTransport
}

/**
 * Streams and decrypts the media attached to a message without a connected
 * `WaClient`. Resolves the encrypted payload (directPath, mediaKey, file
 * hashes) from `source`, fetches the ciphertext from the WhatsApp media CDN,
 * and decrypts it on the fly.
 *
 * The media keys come from the (already decrypted) message itself, so this is
 * for re-downloading media you have persisted - not for fetching media you
 * never received. The CDN download needs no session or auth token; only the
 * upload path does.
 *
 * **The caller owns the returned stream** - pipe it somewhere or call
 * `.destroy()` to release the socket; an unconsumed stream leaks the
 * connection. MAC + SHA-256 verification runs as bytes are consumed, so
 * aborting mid-read leaves you with unverified bytes. Pass `options.signal`
 * to cancel cleanly.
 *
 * @throws when `source` carries no downloadable media.
 * @example
 * ```ts
 * import { downloadMediaMessage } from 'zapo-js'
 * import { createWriteStream } from 'node:fs'
 *
 * const stream = await downloadMediaMessage(event)
 * stream.pipe(createWriteStream('photo.jpg'))
 * ```
 * @example
 * ```ts
 * // Route the CDN download through an http.Agent-style proxy
 * import { HttpsProxyAgent } from 'https-proxy-agent'
 *
 * const stream = await downloadMediaMessage(event, {
 *     proxy: new HttpsProxyAgent('http://127.0.0.1:8080')
 * })
 * ```
 */
export async function downloadMediaMessage(
    source: Proto.IMessage | WaIncomingMessageEvent,
    options: WaDownloadMediaMessageOptions = {}
): Promise<Readable> {
    const message: Proto.IMessage | null | undefined = 'rawNode' in source ? source.message : source
    const payload = resolveMediaPayload(message)
    if (!payload) {
        throw new Error('message has no downloadable media')
    }
    const transfer = options.transfer ?? new WaMediaTransferClient()
    const { plaintext } = await transfer.downloadAndDecryptStream({
        directPath: payload.directPath,
        mediaType: payload.mediaType,
        mediaKey: payload.mediaKey,
        fileSha256: payload.fileSha256,
        fileEncSha256: payload.fileEncSha256,
        agent: toProxyAgent(options.proxy),
        timeoutMs: options.timeoutMs,
        signal: options.signal,
        maxBytes: options.maxBytes
    })
    return plaintext
}
