import type { Readable } from 'node:stream'

import {
    assertMediaUploadStatus,
    parseMediaUploadJsonBody,
    performPlaintextMediaUpload,
    type WaUploadMediaSource
} from '@client/media'
import type { Logger } from '@infra/log/types'
import { NEWSLETTER_MEDIA_UPLOAD_PATHS, type NewsletterMediaKind } from '@media/constants'
import { createStickerPackZipStream } from '@media/sticker-pack'
import type { WaMediaConn } from '@media/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { isSendMediaMessage, isSendTextMessage, resolveMessageTypeAttr } from '@message/content'
import { applyContextInfo, type WaSendContextInfo } from '@message/context-info'
import {
    toStickerPackProtoStickers,
    toStickerPackZipEntries,
    validateStickerPackInput
} from '@message/sticker-pack'
import type {
    WaSendMediaMessage,
    WaSendMessageContent,
    WaSendStickerPackMessage
} from '@message/types'
import { proto, type Proto } from '@proto'
import { WA_ENC_MEDIA_TYPES } from '@protocol/message'
import { base64ToBytes } from '@util/bytes'

export type WaNewsletterUploadMedia = WaUploadMediaSource

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

export async function uploadNewsletterMedia(
    options: {
        readonly mediaTransfer: WaMediaTransferClient
        readonly logger: Logger
    },
    input: WaNewsletterUploadInput
): Promise<WaNewsletterUploadResult> {
    const upload = await performPlaintextMediaUpload(
        {
            mediaTransfer: options.mediaTransfer,
            mediaConn: input.mediaConn,
            logger: options.logger
        },
        {
            source: input.media,
            path: NEWSLETTER_MEDIA_UPLOAD_PATHS[input.mediaKind],
            mimetype: input.mimetype,
            logLabel: 'sending newsletter media upload'
        }
    )
    assertMediaUploadStatus(upload.status, 'newsletter media upload')
    const parsed = parseMediaUploadJsonBody<NewsletterUploadResponseJson>(
        upload.responseBytes,
        'newsletter media upload'
    )
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
            : undefined,
        fileSha256: upload.fileSha256,
        fileLength: upload.byteLength,
        mediaId: upload.mediaId
    }
}

export type WaNewsletterContentKind = 'text' | 'media' | 'poll-creation'

export interface WaNewsletterBuiltContent {
    readonly kind: WaNewsletterContentKind
    readonly plaintext: Uint8Array
    readonly mediaType: string | null
    readonly upload: WaNewsletterUploadResult | null
}

export interface BuildNewsletterContentOptions {
    readonly logger: Logger
    readonly mediaTransfer?: WaMediaTransferClient
    readonly getMediaConn?: () => Promise<WaMediaConn>
}

function resolveSendMediaKind(content: WaSendMediaMessage): NewsletterMediaKind {
    if (content.type === 'video' && content.gifPlayback) return 'gif'
    if (content.type === 'audio' && content.ptt) return 'ptt'
    return content.type
}

function pickMediaTypeFromMessage(message: Proto.IMessage): string | null {
    if (message.imageMessage) return WA_ENC_MEDIA_TYPES.IMAGE
    if (message.videoMessage)
        return message.videoMessage.gifPlayback ? WA_ENC_MEDIA_TYPES.GIF : WA_ENC_MEDIA_TYPES.VIDEO
    if (message.audioMessage)
        return message.audioMessage.ptt ? WA_ENC_MEDIA_TYPES.PTT : WA_ENC_MEDIA_TYPES.AUDIO
    if (message.documentMessage) return WA_ENC_MEDIA_TYPES.DOCUMENT
    if (message.stickerMessage) return WA_ENC_MEDIA_TYPES.STICKER
    if (message.stickerPackMessage) return WA_ENC_MEDIA_TYPES.STICKER_PACK
    if (message.ptvMessage) return WA_ENC_MEDIA_TYPES.PTV
    return null
}

function buildMediaProtoMessage(
    content: Exclude<WaSendMediaMessage, WaSendStickerPackMessage>,
    upload: WaNewsletterUploadResult
): Proto.IMessage {
    const common = {
        url: upload.url,
        directPath: upload.directPath,
        mimetype: 'mimetype' in content ? content.mimetype : undefined,
        fileSha256: upload.fileSha256,
        fileLength: upload.fileLength
    }
    switch (content.type) {
        case 'image':
            return {
                imageMessage: {
                    ...content,
                    ...common,
                    type: undefined,
                    media: undefined
                } as Proto.Message.IImageMessage
            }
        case 'video':
            return {
                videoMessage: {
                    ...content,
                    ...common,
                    type: undefined,
                    media: undefined
                } as Proto.Message.IVideoMessage
            }
        case 'ptv':
            return {
                ptvMessage: {
                    ...content,
                    ...common,
                    type: undefined,
                    media: undefined
                } as Proto.Message.IVideoMessage
            }
        case 'audio':
            return {
                audioMessage: {
                    ...content,
                    ...common,
                    type: undefined,
                    media: undefined
                } as Proto.Message.IAudioMessage
            }
        case 'document':
            return {
                documentMessage: {
                    ...content,
                    ...common,
                    type: undefined,
                    media: undefined
                } as Proto.Message.IDocumentMessage
            }
        case 'sticker':
            return {
                stickerMessage: {
                    ...content,
                    ...common,
                    mimetype: common.mimetype ?? 'image/webp',
                    type: undefined,
                    media: undefined
                } as Proto.Message.IStickerMessage
            }
    }
}

function toUploadMedia(
    media: Uint8Array | ArrayBuffer | Readable | string
): Uint8Array | string | Readable {
    if (media instanceof Uint8Array) return media
    if (media instanceof ArrayBuffer) return new Uint8Array(media)
    return media
}

export async function buildNewsletterMessageContent(
    options: BuildNewsletterContentOptions,
    content: WaSendMessageContent,
    ctx?: WaSendContextInfo | null
): Promise<WaNewsletterBuiltContent> {
    if (typeof content === 'string') {
        const message = applyContextInfo({ conversation: content }, ctx)
        return {
            kind: 'text',
            plaintext: proto.Message.encode(message).finish(),
            mediaType: null,
            upload: null
        }
    }

    if (isSendTextMessage(content)) {
        const message = applyContextInfo({ extendedTextMessage: { text: content.text } }, ctx)
        return {
            kind: 'text',
            plaintext: proto.Message.encode(message).finish(),
            mediaType: null,
            upload: null
        }
    }

    if (isSendMediaMessage(content)) {
        if (!options.mediaTransfer || !options.getMediaConn) {
            throw new Error(
                'newsletter media send requires mediaTransfer and getMediaConn dependencies'
            )
        }
        const mediaConn = await options.getMediaConn()
        if (content.type === 'sticker-pack') {
            validateStickerPackInput(content)
            const upload = await uploadNewsletterMedia(
                { mediaTransfer: options.mediaTransfer, logger: options.logger },
                {
                    mediaKind: 'sticker-pack',
                    media: createStickerPackZipStream(toStickerPackZipEntries(content)),
                    mimetype: 'application/zip',
                    mediaConn
                }
            )
            const stickerPackMessage: Proto.Message.IStickerPackMessage = {
                stickerPackId: content.stickerPackId,
                name: content.name,
                publisher: content.publisher,
                stickers: toStickerPackProtoStickers(content),
                fileLength: upload.fileLength,
                fileSha256: upload.fileSha256,
                directPath: upload.directPath,
                trayIconFileName: content.trayIcon.fileName,
                stickerPackSize: upload.fileLength,
                stickerPackOrigin: proto.Message.StickerPackMessage.StickerPackOrigin.USER_CREATED,
                caption: content.caption,
                packDescription: content.packDescription
            }
            const message = applyContextInfo({ stickerPackMessage }, ctx)
            return {
                kind: 'media',
                plaintext: proto.Message.encode(message).finish(),
                mediaType: WA_ENC_MEDIA_TYPES.STICKER_PACK,
                upload
            }
        }
        const explicitMimetype = 'mimetype' in content && content.mimetype ? content.mimetype : null
        const resolvedMimetype =
            explicitMimetype ?? (content.type === 'sticker' ? 'image/webp' : null)
        if (!resolvedMimetype) {
            throw new Error(
                `newsletter media send requires explicit mimetype for ${content.type} content`
            )
        }
        const upload = await uploadNewsletterMedia(
            { mediaTransfer: options.mediaTransfer, logger: options.logger },
            {
                mediaKind: resolveSendMediaKind(content),
                media: toUploadMedia(content.media),
                mimetype: resolvedMimetype,
                mediaConn
            }
        )
        const message = applyContextInfo(buildMediaProtoMessage(content, upload), ctx)
        return {
            kind: 'media',
            plaintext: proto.Message.encode(message).finish(),
            mediaType: resolveSendMediaKind(content),
            upload
        }
    }

    const protoMessage = applyContextInfo(content, ctx)
    const messageTypeAttr = resolveMessageTypeAttr(protoMessage)
    const isPollCreation = messageTypeAttr === 'poll' && Boolean(protoMessage.pollCreationMessage)
    const mediaTypeAttr = pickMediaTypeFromMessage(protoMessage)
    return {
        kind: isPollCreation ? 'poll-creation' : mediaTypeAttr ? 'media' : 'text',
        plaintext: proto.Message.encode(protoMessage).finish(),
        mediaType: mediaTypeAttr,
        upload: null
    }
}
