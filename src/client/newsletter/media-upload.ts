import { createReadStream } from 'node:fs'
import type { Readable } from 'node:stream'

import {
    cleanupTempFile,
    hashFileWithSha256,
    isReadableStream,
    streamToTempFileWithSha256
} from '@client/media'
import { randomIntAsync, sha256 } from '@crypto/core'
import type { Logger } from '@infra/log/types'
import { NEWSLETTER_MEDIA_UPLOAD_PATHS, type NewsletterMediaKind } from '@media/constants'
import type { WaMediaConn } from '@media/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { base64ToBytes, bytesToBase64UrlSafe, TEXT_DECODER } from '@util/bytes'
import { toError } from '@util/primitives'

// node:crypto randomInt caps max at 2**48 - 1; well within JS safe integer range.
const MEDIA_ID_MAX = 281_474_976_710_655

export type WaNewsletterUploadMedia = Uint8Array | string | Readable

export interface WaNewsletterUploadInput {
    readonly mediaKind: NewsletterMediaKind
    readonly media: WaNewsletterUploadMedia
    readonly mimetype: string
    readonly mediaConn: WaMediaConn
}

export interface WaNewsletterUploadResult {
    readonly url: string
    readonly directPath: string
    readonly handle?: string
    readonly metadataUrl?: string
    readonly thumbnailDirectPath?: string
    readonly thumbnailSha256?: Uint8Array
    readonly fileSha256: Uint8Array
    readonly fileLength: number
    readonly mediaId: string
}

interface NewsletterUploadResponseJson {
    readonly url?: string
    readonly direct_path?: string
    readonly handle?: string
    readonly metadata_url?: string
    readonly thumbnail_info?: {
        readonly thumbnail_direct_path?: string
        readonly thumbnail_sha256?: string
    }
}

interface PreparedUpload {
    readonly fileSha256: Uint8Array
    readonly byteLength: number
    readonly body: Uint8Array | Readable
    readonly cleanup?: () => Promise<void>
}

async function prepareUpload(media: WaNewsletterUploadMedia): Promise<PreparedUpload> {
    if (media instanceof Uint8Array) {
        return {
            fileSha256: sha256(media),
            byteLength: media.byteLength,
            body: media
        }
    }
    if (typeof media === 'string') {
        const metrics = await hashFileWithSha256(media)
        return {
            fileSha256: metrics.fileSha256,
            byteLength: metrics.byteLength,
            body: createReadStream(media)
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
    throw new Error('newsletter media upload received unsupported media type')
}

async function generateMediaId(): Promise<string> {
    const value = await randomIntAsync(0, MEDIA_ID_MAX)
    return value.toString(10)
}

function buildNewsletterUploadUrl(
    host: string,
    mediaKind: NewsletterMediaKind,
    auth: string,
    fileSha256: Uint8Array,
    mediaId: string
): string {
    const path = NEWSLETTER_MEDIA_UPLOAD_PATHS[mediaKind]
    const hashToken = bytesToBase64UrlSafe(fileSha256)
    return (
        `https://${host}${path}/${hashToken}` +
        `?auth=${encodeURIComponent(auth)}&token=${encodeURIComponent(hashToken)}&media_id=${mediaId}`
    )
}

type ParsedUploadResponse = Omit<WaNewsletterUploadResult, 'fileSha256' | 'fileLength' | 'mediaId'>

function parseNewsletterUploadResponse(body: Uint8Array, status: number): ParsedUploadResponse {
    if (status < 200 || status >= 300) {
        throw new Error(`newsletter media upload failed with status ${status}`)
    }
    let parsed: NewsletterUploadResponseJson
    try {
        parsed = JSON.parse(TEXT_DECODER.decode(body)) as NewsletterUploadResponseJson
    } catch (error) {
        throw new Error(`newsletter media upload returned invalid json: ${toError(error).message}`)
    }
    if (!parsed.url || !parsed.direct_path) {
        throw new Error('newsletter media upload response missing url/direct_path')
    }
    return {
        url: parsed.url,
        directPath: parsed.direct_path,
        handle: parsed.handle,
        metadataUrl: parsed.metadata_url,
        thumbnailDirectPath: parsed.thumbnail_info?.thumbnail_direct_path,
        thumbnailSha256: parsed.thumbnail_info?.thumbnail_sha256
            ? base64ToBytes(parsed.thumbnail_info.thumbnail_sha256)
            : undefined
    }
}

export async function uploadNewsletterMedia(
    options: {
        readonly mediaTransfer: WaMediaTransferClient
        readonly logger: Logger
    },
    input: WaNewsletterUploadInput
): Promise<WaNewsletterUploadResult> {
    const prepared = await prepareUpload(input.media)
    try {
        const mediaConn = input.mediaConn
        const selectedHost =
            mediaConn.hosts.find((host) => !host.isFallback)?.hostname ??
            mediaConn.hosts[0].hostname
        const mediaId = await generateMediaId()
        const uploadUrl = buildNewsletterUploadUrl(
            selectedHost,
            input.mediaKind,
            mediaConn.auth,
            prepared.fileSha256,
            mediaId
        )

        options.logger.debug('sending newsletter media upload', {
            mediaKind: input.mediaKind,
            host: selectedHost,
            size: prepared.byteLength
        })

        const response = await options.mediaTransfer.uploadStream({
            url: uploadUrl,
            method: 'POST',
            body: prepared.body,
            contentLength: prepared.byteLength,
            contentType: input.mimetype
        })
        const responseBytes = await options.mediaTransfer.readResponseBytes(response)
        const parsed = parseNewsletterUploadResponse(responseBytes, response.status)

        return {
            ...parsed,
            fileSha256: prepared.fileSha256,
            fileLength: prepared.byteLength,
            mediaId
        }
    } finally {
        await prepared.cleanup?.()
    }
}
