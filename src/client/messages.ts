import type { Logger } from '../infra/log/types'
import { buildMediaConnIq, parseMediaConnResponse } from '../media/conn'
import { MEDIA_CONN_CACHE_GRACE_MS, MEDIA_UPLOAD_PATHS } from '../media/constants'
import type { WaMediaConn } from '../media/types'
import { WaMediaCrypto } from '../media/WaMediaCrypto'
import type { WaMediaTransferClient } from '../media/WaMediaTransferClient'
import { isSendMediaMessage } from '../message/content'
import type { WaSendMediaMessage, WaSendMessageContent } from '../message/types'
import type { Proto } from '../proto'
import { WA_DEFAULTS } from '../protocol/constants'
import type { BinaryNode } from '../transport/types'
import { bytesToBase64UrlSafe } from '../util/base64'
import { toBytesView } from '../util/bytes'
import { toError } from '../util/primitives'

const TEXT_DECODER = new TextDecoder()

interface WaMediaMessageOptions {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
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
        WA_DEFAULTS.IQ_TIMEOUT_MS
    )
    const mediaConn = parseMediaConnResponse(response, Date.now())
    options.setMediaConnCache(mediaConn)
    return mediaConn
}

async function buildMediaMessage(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage
): Promise<Proto.IMessage> {
    const mediaBytes = toBytesView(content.media)
    const uploaded = await uploadMedia(options, content, mediaBytes)
    const mediaKeyTimestamp = Math.floor(Date.now() / 1000)
    const common = {
        url: uploaded.url,
        mimetype: content.mimetype,
        fileSha256: uploaded.fileSha256,
        fileLength: mediaBytes.byteLength,
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
            throw new Error(`unsupported media type: ${(content as { type: string }).type}`)
    }
}

async function uploadMedia(
    options: WaMediaMessageOptions,
    content: WaSendMediaMessage,
    mediaBytes: Uint8Array
): Promise<{
    readonly url: string
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileEncSha256: Uint8Array
    readonly metadataUrl?: string
}> {
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const uploadType =
        content.type === 'video' && content.gifPlayback
            ? 'gif'
            : content.type === 'audio' && content.ptt
              ? 'ptt'
              : content.type
    const encrypted = await WaMediaCrypto.encryptBytes(uploadType, mediaKey, mediaBytes)
    const mediaConn = await getMediaConn(options)
    const selectedHost =
        mediaConn.hosts.find((host) => !host.isFallback)?.hostname ?? mediaConn.hosts[0].hostname
    const uploadPath = MEDIA_UPLOAD_PATHS[uploadType]
    const hashToken = bytesToBase64UrlSafe(encrypted.fileEncSha256)
    const uploadUrl = `https://${selectedHost}${uploadPath}/${hashToken}?auth=${encodeURIComponent(mediaConn.auth)}&token=${encodeURIComponent(hashToken)}`

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
    const uploadBody = await options.mediaTransfer.readResponseBytes(uploadResponse)
    if (!uploadResponse.ok) {
        throw new Error(`media upload failed with status ${uploadResponse.status}`)
    }

    let parsedBody: {
        readonly url?: string
        readonly direct_path?: string
        readonly metadata_url?: string
    }
    try {
        parsedBody = JSON.parse(TEXT_DECODER.decode(uploadBody)) as {
            readonly url?: string
            readonly direct_path?: string
            readonly metadata_url?: string
        }
    } catch (error) {
        throw new Error(`media upload returned invalid json: ${toError(error).message}`)
    }

    if (!parsedBody.url || !parsedBody.direct_path) {
        throw new Error('media upload response missing url/direct_path')
    }

    return {
        url: parsedBody.url,
        directPath: parsedBody.direct_path,
        mediaKey,
        fileSha256: encrypted.fileSha256,
        fileEncSha256: encrypted.fileEncSha256,
        ...(parsedBody.metadata_url ? { metadataUrl: parsedBody.metadata_url } : {})
    }
}
