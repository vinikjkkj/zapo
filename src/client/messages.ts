import { createReadStream } from 'node:fs'
import type { Readable } from 'node:stream'

import {
    assertMediaUploadStatus,
    buildMediaUploadUrl,
    cleanupTempFile,
    hasMediaProcessingTasks,
    isReadableStream,
    parseMediaUploadJsonBody,
    parseWebpAnimation,
    readFileHead,
    resolveMediaInputs,
    runMediaProcessor,
    selectMediaUploadHost
} from '@client/media'
import type { WaMediaOptions } from '@client/types'
import type { Logger } from '@infra/log/types'
import { parseMediaConnResponse } from '@media/conn'
import { MEDIA_CONN_CACHE_GRACE_MS, MEDIA_UPLOAD_PATHS } from '@media/constants'
import type { MediaCryptoType, WaMediaConn } from '@media/types'
import { WaMediaCrypto } from '@media/WaMediaCrypto'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { isSendMediaMessage } from '@message/content'
import type {
    WaMessageBuildResult,
    WaMessageUploadInfo,
    WaSendMediaMessage,
    WaSendMessageContent
} from '@message/types'
import { WA_DEFAULTS } from '@protocol/constants'
import { buildMediaConnIq } from '@transport/node/builders/media'
import type { BinaryNode } from '@transport/types'

export interface WaMediaMessageOptions {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly iqTimeoutMs?: number
    readonly queryWithContext: (
        context: string,
        node: BinaryNode,
        timeoutMs?: number,
        contextData?: Readonly<Record<string, unknown>>
    ) => Promise<BinaryNode>
    readonly getMediaConnCache: () => WaMediaConn | null
    readonly setMediaConnCache: (mediaConn: WaMediaConn | null) => void
    readonly media?: WaMediaOptions
}

export async function buildMediaMessageContent(
    options: WaMediaMessageOptions,
    content: WaSendMessageContent
): Promise<WaMessageBuildResult> {
    if (typeof content === 'string') {
        return { message: { conversation: content } }
    }
    if (isSendMediaMessage(content)) {
        return buildMediaMessage(options, content)
    }
    if (!content || typeof content !== 'object') {
        throw new Error('invalid message content')
    }
    return { message: content }
}

export async function getMediaConn(
    options: WaMediaMessageOptions,
    forceRefresh = false
): Promise<WaMediaConn> {
    const cached = options.getMediaConnCache()
    if (!forceRefresh && cached && Date.now() + MEDIA_CONN_CACHE_GRACE_MS < cached.expiresAtMs) {
        return cached
    }

    const response = await options.queryWithContext(
        'media_conn.fetch',
        buildMediaConnIq(),
        options.iqTimeoutMs ?? WA_DEFAULTS.IQ_TIMEOUT_MS
    )
    const mediaConn = parseMediaConnResponse(response, Date.now())
    options.setMediaConnCache(mediaConn)
    return mediaConn
}

function needsSidecar(content: WaSendMediaMessage): boolean {
    return content.type === 'video' || content.type === 'ptv' || content.type === 'audio'
}

function resolveUploadType(content: WaSendMediaMessage): MediaCryptoType {
    if (content.type === 'video' && content.gifPlayback) return 'gif'
    if (content.type === 'audio' && content.ptt) return 'ptt'
    return content.type as MediaCryptoType
}

function resolveMimetype(content: WaSendMediaMessage): string {
    if (content.mimetype) return content.mimetype
    if (content.type === 'sticker') return 'image/webp'
    throw new Error(`mimetype is required for ${content.type} messages`)
}

async function buildMediaMessage(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage
): Promise<WaMessageBuildResult> {
    const needsTempFile =
        hasMediaProcessingTasks(options.media, content) ||
        (content.type === 'sticker' && content.firstFrameLength === undefined)
    const resolved = await resolveMediaInputs(needsTempFile, content.media)

    try {
        let detectedFirstFrameLength: number | undefined
        if (
            content.type === 'sticker' &&
            content.firstFrameLength === undefined &&
            resolved.processorInput
        ) {
            const input = resolved.processorInput
            const header =
                typeof input === 'string' ? await readFileHead(input, 100) : input.subarray(0, 100)
            detectedFirstFrameLength = parseWebpAnimation(header)?.firstFrameLength
        }
        const firstFrameLength =
            content.type === 'sticker'
                ? (content.firstFrameLength ?? detectedFirstFrameLength)
                : undefined

        const uploadPromise = isReadableStream(resolved.uploadMedia)
            ? uploadMediaStream(options, content, resolved.uploadMedia, firstFrameLength)
            : uploadMediaBytes(options, content, resolved.uploadMedia, firstFrameLength)
        const processPromise = runMediaProcessor(
            options.media,
            resolved.processorInput,
            content,
            options.logger
        )
        const [uploadResult, processResult] = await Promise.allSettled([
            uploadPromise,
            processPromise
        ])
        if (uploadResult.status === 'rejected') throw uploadResult.reason
        if (processResult.status === 'rejected') throw processResult.reason
        const uploaded = uploadResult.value
        const processed = processResult.value
        const mediaKeyTimestamp = Math.floor(Date.now() / 1000)
        const uploadedFields = {
            url: uploaded.url,
            fileSha256: uploaded.fileSha256,
            fileLength: uploaded.fileLength,
            mediaKey: uploaded.mediaKey,
            fileEncSha256: uploaded.fileEncSha256,
            directPath: uploaded.directPath,
            mediaKeyTimestamp,
            mimetype: resolveMimetype(content)
        }
        const uploadSummary: WaMessageUploadInfo = {
            url: uploaded.url,
            directPath: uploaded.directPath,
            fileSha256: uploaded.fileSha256,
            fileLength: uploaded.fileLength,
            metadataUrl: uploaded.metadataUrl
        }

        function spread(c: WaSendMediaMessage): Record<string, unknown> {
            const result: Record<string, unknown> = {}
            for (const key in c) {
                if (
                    key !== 'type' &&
                    key !== 'media' &&
                    key !== 'fileLength' &&
                    key !== 'mimetype'
                ) {
                    result[key] = (c as unknown as Record<string, unknown>)[key]
                }
            }
            return result
        }

        switch (content.type) {
            case 'image':
                return {
                    upload: uploadSummary,
                    message: {
                        imageMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail
                        }
                    }
                }
            case 'video':
                return {
                    upload: uploadSummary,
                    message: {
                        videoMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            seconds: content.seconds ?? processed.seconds,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail,
                            streamingSidecar: uploaded.streamingSidecar,
                            metadataUrl: uploaded.metadataUrl
                        }
                    }
                }
            case 'ptv':
                return {
                    upload: uploadSummary,
                    message: {
                        ptvMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            seconds: content.seconds ?? processed.seconds,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail,
                            streamingSidecar: uploaded.streamingSidecar
                        }
                    }
                }
            case 'audio':
                return {
                    upload: uploadSummary,
                    message: {
                        audioMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            seconds: content.seconds ?? processed.seconds,
                            streamingSidecar: uploaded.streamingSidecar,
                            waveform: content.waveform ?? processed.waveform
                        }
                    }
                }
            case 'document':
                return {
                    upload: uploadSummary,
                    message: {
                        documentMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            fileName: content.fileName ?? 'file',
                            title: content.title ?? content.fileName ?? undefined,
                            jpegThumbnail: content.jpegThumbnail ?? processed.jpegThumbnail
                        }
                    }
                }
            case 'sticker':
                return {
                    upload: uploadSummary,
                    message: {
                        stickerMessage: {
                            ...spread(content),
                            ...uploadedFields,
                            width: content.width ?? processed.width,
                            height: content.height ?? processed.height,
                            pngThumbnail: content.pngThumbnail ?? processed.pngThumbnail,
                            isAnimated:
                                content.isAnimated ??
                                processed.isAnimated ??
                                firstFrameLength !== undefined,
                            firstFrameLength: content.firstFrameLength ?? uploaded.firstFrameLength,
                            firstFrameSidecar:
                                content.firstFrameSidecar ?? uploaded.firstFrameSidecar,
                            stickerSentTs: content.stickerSentTs ?? Date.now()
                        }
                    }
                }
            default:
                throw new Error(
                    `unsupported media message type: ${String((content as Record<string, unknown>).type)}`
                )
        }
    } finally {
        if (resolved.tempFilePath) {
            await cleanupTempFile(resolved.tempFilePath)
        }
    }
}

interface UploadResult {
    readonly url: string
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly fileLength: number
    readonly metadataUrl?: string
    readonly streamingSidecar?: Uint8Array
    readonly firstFrameSidecar?: Uint8Array
    readonly firstFrameLength?: number
}

function resolveUploadPath(uploadType: MediaCryptoType): string {
    const uploadPath = MEDIA_UPLOAD_PATHS[uploadType as keyof typeof MEDIA_UPLOAD_PATHS]
    if (!uploadPath) {
        throw new Error(`unknown media upload type: ${String(uploadType)}`)
    }
    return uploadPath
}

function parseUploadResponse(
    body: Uint8Array,
    status: number
): {
    readonly url: string
    readonly directPath: string
    readonly metadataUrl?: string
} {
    assertMediaUploadStatus(status, 'media upload')
    const parsed = parseMediaUploadJsonBody<{
        readonly url?: string
        readonly direct_path?: string
        readonly metadata_url?: string
    }>(body, 'media upload')
    if (!parsed.url || !parsed.direct_path) {
        throw new Error('media upload response missing url/direct_path')
    }
    return {
        url: parsed.url,
        directPath: parsed.direct_path,
        ...(parsed.metadata_url ? { metadataUrl: parsed.metadata_url } : {})
    }
}

async function uploadMediaBytes(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage,
    mediaBytes: Uint8Array,
    firstFrameLength?: number
): Promise<UploadResult> {
    const uploadType = resolveUploadType(content)
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const [encrypted, mediaConn] = await Promise.all([
        WaMediaCrypto.encryptBytes(uploadType, mediaKey, mediaBytes, {
            sidecar: needsSidecar(content),
            firstFrameLength
        }),
        getMediaConn(options)
    ])
    const selectedHost = selectMediaUploadHost(mediaConn)
    const uploadUrl = buildMediaUploadUrl(
        selectedHost,
        resolveUploadPath(uploadType),
        mediaConn.auth,
        encrypted.fileEncSha256
    )

    options.logger.debug('sending media upload request', {
        mediaType: content.type,
        uploadType,
        host: selectedHost
    })
    const uploadResponse = await options.mediaTransfer.uploadStream({
        url: uploadUrl,
        method: 'POST',
        body: encrypted.ciphertextHmac,
        contentLength: encrypted.ciphertextHmac.byteLength,
        contentType: resolveMimetype(content)
    })
    const responseBody = await options.mediaTransfer.readResponseBytes(uploadResponse)
    const parsed = parseUploadResponse(responseBody, uploadResponse.status)
    return {
        ...parsed,
        mediaKey,
        fileSha256: encrypted.fileSha256,
        fileEncSha256: encrypted.fileEncSha256,
        fileLength: mediaBytes.byteLength,
        streamingSidecar: encrypted.streamingSidecar,
        firstFrameSidecar: encrypted.firstFrameSidecar,
        firstFrameLength
    }
}

async function uploadMediaStream(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage,
    stream: Readable,
    firstFrameLength?: number
): Promise<UploadResult> {
    const uploadType = resolveUploadType(content)
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const encResult = await WaMediaCrypto.encryptToFile(uploadType, mediaKey, stream, {
        sidecar: needsSidecar(content),
        firstFrameLength
    })
    let readStream: ReturnType<typeof createReadStream> | undefined
    try {
        const mediaConn = await getMediaConn(options)
        const selectedHost = selectMediaUploadHost(mediaConn)
        const uploadUrl = buildMediaUploadUrl(
            selectedHost,
            resolveUploadPath(uploadType),
            mediaConn.auth,
            encResult.fileEncSha256
        )

        options.logger.debug('sending media stream upload request', {
            mediaType: content.type,
            uploadType,
            host: selectedHost,
            encryptedSize: encResult.fileSize
        })
        readStream = createReadStream(encResult.filePath)
        const uploadResponse = await options.mediaTransfer.uploadStream({
            url: uploadUrl,
            method: 'POST',
            body: readStream,
            contentLength: encResult.fileSize,
            contentType: resolveMimetype(content)
        })
        const responseBody = await options.mediaTransfer.readResponseBytes(uploadResponse)
        const parsed = parseUploadResponse(responseBody, uploadResponse.status)
        return {
            ...parsed,
            mediaKey,
            fileSha256: encResult.fileSha256,
            fileEncSha256: encResult.fileEncSha256,
            fileLength: encResult.plaintextLength,
            streamingSidecar: encResult.streamingSidecar,
            firstFrameSidecar: encResult.firstFrameSidecar,
            firstFrameLength
        }
    } finally {
        if (readStream && !readStream.closed) {
            await new Promise<void>((resolve) => {
                readStream!.once('close', resolve)
                readStream!.destroy()
            })
        }
        await WaMediaCrypto.cleanupEncryptedFile(encResult.filePath)
    }
}
