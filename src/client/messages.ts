import { createReadStream } from 'node:fs'
import type { Readable } from 'node:stream'

import type { Logger } from '@infra/log/types'
import { parseMediaConnResponse } from '@media/conn'
import { MEDIA_CONN_CACHE_GRACE_MS, MEDIA_UPLOAD_PATHS } from '@media/constants'
import type { MediaCryptoType, WaMediaConn } from '@media/types'
import { WaMediaCrypto } from '@media/WaMediaCrypto'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { isSendMediaMessage } from '@message/content'
import type { WaSendMediaMessage, WaSendMessageContent } from '@message/types'
import type { Proto } from '@proto'
import { WA_DEFAULTS } from '@protocol/constants'
import { buildMediaConnIq } from '@transport/node/builders/media'
import type { BinaryNode } from '@transport/types'
import { bytesToBase64UrlSafe, TEXT_DECODER, toBytesView } from '@util/bytes'
import { toError } from '@util/primitives'

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
}

export async function buildMediaMessageContent(
    options: WaMediaMessageOptions,
    content: WaSendMessageContent
): Promise<Proto.IMessage> {
    if (typeof content === 'string') {
        return {
            conversation: content
        }
    }
    if (isSendMediaMessage(content)) {
        return buildMediaMessage(options, content)
    }
    if (!content || typeof content !== 'object') {
        throw new Error('invalid message content')
    }
    return content
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

function resolveUploadType(content: WaSendMediaMessage): MediaCryptoType {
    if (content.type === 'video' && content.gifPlayback) return 'gif'
    if (content.type === 'audio' && content.ptt) return 'ptt'
    return content.type as MediaCryptoType
}

function isReadableStream(value: unknown): value is Readable {
    return (
        !!value &&
        typeof value === 'object' &&
        'pipe' in value &&
        typeof (value as Readable).pipe === 'function'
    )
}

async function buildMediaMessage(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage
): Promise<Proto.IMessage> {
    const uploaded = isReadableStream(content.media)
        ? await uploadMediaStream(options, content, content.media)
        : await uploadMediaBytes(options, content, toBytesView(content.media))
    const mediaKeyTimestamp = Math.floor(Date.now() / 1000)
    const common = {
        url: uploaded.url,
        mimetype: content.mimetype,
        fileSha256: uploaded.fileSha256,
        fileLength: uploaded.fileLength,
        mediaKey: uploaded.mediaKey,
        fileEncSha256: uploaded.fileEncSha256,
        directPath: uploaded.directPath,
        mediaKeyTimestamp
    }

    switch (content.type) {
        case 'image':
            return {
                imageMessage: {
                    ...common,
                    caption: content.caption,
                    width: content.width,
                    height: content.height
                }
            }
        case 'video':
            return {
                videoMessage: {
                    ...common,
                    caption: content.caption,
                    gifPlayback: content.gifPlayback,
                    seconds: content.seconds,
                    width: content.width,
                    height: content.height,
                    metadataUrl: uploaded.metadataUrl
                }
            }
        case 'ptv':
            return {
                ptvMessage: {
                    ...common,
                    seconds: content.seconds,
                    width: content.width,
                    height: content.height
                }
            }
        case 'audio':
            return {
                audioMessage: {
                    ...common,
                    seconds: content.seconds,
                    ptt: content.ptt
                }
            }
        case 'document':
            return {
                documentMessage: {
                    ...common,
                    caption: content.caption,
                    fileName: content.fileName ?? 'file',
                    title: content.fileName ?? undefined
                }
            }
        case 'sticker':
            return {
                stickerMessage: {
                    ...common,
                    width: content.width,
                    height: content.height
                }
            }
        default:
            throw new Error(
                `unsupported media message type: ${String((content as Record<string, unknown>).type)}`
            )
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
}

function buildUploadUrl(
    host: string,
    uploadType: MediaCryptoType,
    auth: string,
    fileEncSha256: Uint8Array
): string {
    const hashToken = bytesToBase64UrlSafe(fileEncSha256)
    const uploadPath = MEDIA_UPLOAD_PATHS[uploadType as keyof typeof MEDIA_UPLOAD_PATHS]
    if (!uploadPath) {
        throw new Error(`unknown media upload type: ${String(uploadType)}`)
    }
    return `https://${host}${uploadPath}/${hashToken}?auth=${encodeURIComponent(auth)}&token=${encodeURIComponent(hashToken)}`
}

function parseUploadResponse(
    body: Uint8Array,
    status: number
): {
    readonly url: string
    readonly directPath: string
    readonly metadataUrl?: string
} {
    if (status < 200 || status >= 300) {
        throw new Error(`media upload failed with status ${status}`)
    }
    let parsed: {
        readonly url?: string
        readonly direct_path?: string
        readonly metadata_url?: string
    }
    try {
        parsed = JSON.parse(TEXT_DECODER.decode(body)) as typeof parsed
    } catch (error) {
        throw new Error(`media upload returned invalid json: ${toError(error).message}`)
    }
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
    mediaBytes: Uint8Array
): Promise<UploadResult> {
    const uploadType = resolveUploadType(content)
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const [encrypted, mediaConn] = await Promise.all([
        WaMediaCrypto.encryptBytes(uploadType, mediaKey, mediaBytes),
        getMediaConn(options)
    ])
    const selectedHost =
        mediaConn.hosts.find((host) => !host.isFallback)?.hostname ?? mediaConn.hosts[0].hostname
    const uploadUrl = buildUploadUrl(
        selectedHost,
        uploadType,
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
        contentType: content.mimetype
    })
    const responseBody = await options.mediaTransfer.readResponseBytes(uploadResponse)
    const parsed = parseUploadResponse(responseBody, uploadResponse.status)
    return {
        ...parsed,
        mediaKey,
        fileSha256: encrypted.fileSha256,
        fileEncSha256: encrypted.fileEncSha256,
        fileLength: mediaBytes.byteLength
    }
}

async function uploadMediaStream(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage,
    stream: Readable
): Promise<UploadResult> {
    const uploadType = resolveUploadType(content)
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const encResult = await WaMediaCrypto.encryptToFile(uploadType, mediaKey, stream)
    let readStream: ReturnType<typeof createReadStream> | undefined
    try {
        const mediaConn = await getMediaConn(options)
        const selectedHost =
            mediaConn.hosts.find((host) => !host.isFallback)?.hostname ??
            mediaConn.hosts[0].hostname
        const uploadUrl = buildUploadUrl(
            selectedHost,
            uploadType,
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
            contentType: content.mimetype
        })
        const responseBody = await options.mediaTransfer.readResponseBytes(uploadResponse)
        const parsed = parseUploadResponse(responseBody, uploadResponse.status)
        return {
            ...parsed,
            mediaKey,
            fileSha256: encResult.fileSha256,
            fileEncSha256: encResult.fileEncSha256,
            fileLength: encResult.plaintextLength
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
