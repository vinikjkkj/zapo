import { createReadStream } from 'node:fs'

import {
    assertMediaUploadStatus,
    buildMediaUploadUrl,
    parseMediaUploadJsonBody,
    selectMediaUploadHost
} from '@client/media'
import type { Logger } from '@infra/log/types'
import { MEDIA_UPLOAD_PATHS } from '@media/constants'
import { WaMediaCrypto } from '@media/crypto/WaMediaCrypto'
import type { WaMediaTransferClient } from '@media/transfer/WaMediaTransferClient'
import type { WaMediaConn } from '@media/types'
import type { WaLinkPreviewThumbnailFields } from '@message/addons/link-preview/builder'
import { findFirstLink } from '@message/addons/link-preview/detect'
import type {
    WaLinkPreviewFetcher,
    WaLinkPreviewOptions,
    WaLinkPreviewOverride,
    WaLinkPreviewResolved,
    WaLinkPreviewThumbnailBytes,
    WaLinkPreviewThumbnailInput,
    WaLinkPreviewThumbnailStream
} from '@message/addons/link-preview/types'
import { proto } from '@proto'
import type { ServerClock } from '@util/clock'
import { toError } from '@util/primitives'

const INLINE_THUMBNAIL_MAX_BYTES = 64 * 1024

export interface ResolveLinkPreviewDeps {
    readonly logger: Logger
    readonly mediaTransfer: WaMediaTransferClient
    readonly getMediaConn: () => Promise<WaMediaConn>
    readonly fetcher: WaLinkPreviewFetcher
    readonly options: WaLinkPreviewOptions
    readonly serverClock: ServerClock
}

export interface ResolvedLinkPreviewResult {
    readonly resolved: WaLinkPreviewResolved
    readonly thumbnailFields: WaLinkPreviewThumbnailFields
}

export async function resolveLinkPreview(
    text: string,
    perMessage: boolean | WaLinkPreviewOverride | undefined,
    deps: ResolveLinkPreviewDeps
): Promise<ResolvedLinkPreviewResult | null> {
    if (perMessage === false) return null
    const globalEnabled = deps.options.enabled !== false
    if (!globalEnabled && perMessage === undefined) return null

    let resolved: WaLinkPreviewResolved | null
    if (typeof perMessage === 'object' && perMessage !== null) {
        resolved = applyOverride(text, perMessage)
        if (resolved === null) return null
    } else {
        const detected = findFirstLink(text)
        if (detected === null) return null
        resolved = await deps.fetcher.fetch({
            url: detected.url,
            matchedText: detected.matchedText,
            logger: deps.logger
        })
        if (resolved === null) return null
    }

    const thumbnailFields = await resolveThumbnailFields(deps, resolved.thumbnail)
    return { resolved, thumbnailFields }
}

function applyOverride(
    text: string,
    override: WaLinkPreviewOverride
): WaLinkPreviewResolved | null {
    const matchedText = override.matchedText ?? findFirstLink(text)?.matchedText
    if (matchedText === undefined || matchedText.length === 0) return null
    return {
        matchedText,
        previewType: override.previewType ?? proto.Message.ExtendedTextMessage.PreviewType.NONE,
        ...(override.title !== undefined ? { title: override.title } : {}),
        ...(override.description !== undefined ? { description: override.description } : {}),
        ...(override.thumbnail !== undefined ? { thumbnail: override.thumbnail } : {})
    }
}

async function resolveThumbnailFields(
    deps: ResolveLinkPreviewDeps,
    thumbnail: WaLinkPreviewThumbnailInput | undefined
): Promise<WaLinkPreviewThumbnailFields> {
    if (thumbnail === undefined) return {}
    if ('bytes' in thumbnail) {
        return resolveBytesThumbnailFields(deps, thumbnail)
    }
    return resolveStreamThumbnailFields(deps, thumbnail)
}

async function resolveBytesThumbnailFields(
    deps: ResolveLinkPreviewDeps,
    thumbnail: WaLinkPreviewThumbnailBytes
): Promise<WaLinkPreviewThumbnailFields> {
    const fitsInline = thumbnail.bytes.byteLength <= INLINE_THUMBNAIL_MAX_BYTES
    const inlineFields = fitsInline ? buildInlineFields(thumbnail) : {}
    if (deps.options.uploadHqThumbnail === false) {
        return inlineFields
    }
    try {
        const hqFields = await uploadHqFromBytes(deps, thumbnail)
        return { ...inlineFields, ...hqFields }
    } catch (error) {
        deps.logger.warn('link preview thumbnail upload failed', {
            message: toError(error).message
        })
        return inlineFields
    }
}

async function resolveStreamThumbnailFields(
    deps: ResolveLinkPreviewDeps,
    thumbnail: WaLinkPreviewThumbnailStream
): Promise<WaLinkPreviewThumbnailFields> {
    if (deps.options.uploadHqThumbnail === false) {
        thumbnail.stream.destroy()
        return {}
    }
    try {
        return await uploadHqFromStream(deps, thumbnail)
    } catch (error) {
        deps.logger.warn('link preview thumbnail upload failed', {
            message: toError(error).message
        })
        thumbnail.stream.destroy()
        return {}
    }
}

function buildInlineFields(thumbnail: WaLinkPreviewThumbnailBytes): WaLinkPreviewThumbnailFields {
    return {
        jpegThumbnail: thumbnail.bytes,
        ...(thumbnail.width !== undefined ? { thumbnailWidth: thumbnail.width } : {}),
        ...(thumbnail.height !== undefined ? { thumbnailHeight: thumbnail.height } : {})
    }
}

async function uploadHqFromBytes(
    deps: ResolveLinkPreviewDeps,
    thumbnail: WaLinkPreviewThumbnailBytes
): Promise<WaLinkPreviewThumbnailFields> {
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const encrypted = await WaMediaCrypto.encryptBytes(
        'thumbnail-link',
        mediaKey,
        thumbnail.bytes,
        { sidecar: false }
    )
    const directPath = await dispatchUpload(
        deps,
        encrypted.ciphertextHmac,
        encrypted.ciphertextHmac.byteLength,
        encrypted.fileEncSha256
    )
    return {
        thumbnailDirectPath: directPath,
        thumbnailSha256: encrypted.fileSha256,
        thumbnailEncSha256: encrypted.fileEncSha256,
        mediaKey,
        mediaKeyTimestamp: deps.serverClock.nowSeconds(),
        ...(thumbnail.width !== undefined ? { thumbnailWidth: thumbnail.width } : {}),
        ...(thumbnail.height !== undefined ? { thumbnailHeight: thumbnail.height } : {})
    }
}

async function uploadHqFromStream(
    deps: ResolveLinkPreviewDeps,
    thumbnail: WaLinkPreviewThumbnailStream
): Promise<WaLinkPreviewThumbnailFields> {
    const mediaKey = await WaMediaCrypto.generateMediaKey()
    const encrypted = await WaMediaCrypto.encryptToFile(
        'thumbnail-link',
        mediaKey,
        thumbnail.stream,
        { sidecar: false, expectedFileSize: thumbnail.contentLength }
    )
    let readStream: ReturnType<typeof createReadStream> | undefined
    try {
        readStream = createReadStream(encrypted.filePath)
        const directPath = await dispatchUpload(
            deps,
            readStream,
            encrypted.fileSize,
            encrypted.fileEncSha256
        )
        return {
            thumbnailDirectPath: directPath,
            thumbnailSha256: encrypted.fileSha256,
            thumbnailEncSha256: encrypted.fileEncSha256,
            mediaKey,
            mediaKeyTimestamp: deps.serverClock.nowSeconds(),
            ...(thumbnail.width !== undefined ? { thumbnailWidth: thumbnail.width } : {}),
            ...(thumbnail.height !== undefined ? { thumbnailHeight: thumbnail.height } : {})
        }
    } finally {
        if (readStream && !readStream.closed) {
            await new Promise<void>((resolve) => {
                readStream!.once('close', resolve)
                readStream!.destroy()
            })
        }
        await WaMediaCrypto.cleanupEncryptedFile(encrypted.filePath)
    }
}

async function dispatchUpload(
    deps: ResolveLinkPreviewDeps,
    body: Uint8Array | ReturnType<typeof createReadStream>,
    contentLength: number,
    fileEncSha256: Uint8Array
): Promise<string> {
    const mediaConn = await deps.getMediaConn()
    const host = selectMediaUploadHost(mediaConn)
    const uploadUrl = buildMediaUploadUrl(
        host,
        MEDIA_UPLOAD_PATHS['thumbnail-link'],
        mediaConn.auth,
        fileEncSha256
    )
    deps.logger.debug('uploading link preview thumbnail', { host, contentLength })
    const response = await deps.mediaTransfer.uploadStream({
        url: uploadUrl,
        method: 'POST',
        body,
        contentLength,
        contentType: 'image/jpeg'
    })
    const responseBody = await deps.mediaTransfer.readResponseBytes(response)
    assertMediaUploadStatus(response.status, 'thumbnail-link upload')
    const parsed = parseMediaUploadJsonBody<{ readonly direct_path?: string }>(
        responseBody,
        'thumbnail-link upload'
    )
    if (!parsed.direct_path) {
        throw new Error('thumbnail-link upload response missing direct_path')
    }
    return parsed.direct_path
}
