import type { Readable } from 'node:stream'

import {
    uploadNewsletterMedia,
    type WaNewsletterUploadResult
} from '@client/newsletter/media-upload'
import type { Logger } from '@infra/log/types'
import type { NewsletterMediaKind } from '@media/constants'
import type { WaMediaConn } from '@media/types'
import type { WaMediaTransferClient } from '@media/WaMediaTransferClient'
import { isSendMediaMessage, resolveMessageTypeAttr } from '@message/content'
import type { WaSendMediaMessage, WaSendMessageContent } from '@message/types'
import { proto, type Proto } from '@proto'

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
    if (message.imageMessage) return 'image'
    if (message.videoMessage) return message.videoMessage.gifPlayback ? 'gif' : 'video'
    if (message.audioMessage) return message.audioMessage.ptt ? 'ptt' : 'audio'
    if (message.documentMessage) return 'document'
    if (message.stickerMessage) return 'sticker'
    if (message.ptvMessage) return 'ptv'
    return null
}

function buildMediaProtoMessage(
    content: WaSendMediaMessage,
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

function toUploadMedia(media: WaSendMediaMessage['media']): Uint8Array | string | Readable {
    if (media instanceof Uint8Array) return media
    if (media instanceof ArrayBuffer) return new Uint8Array(media)
    return media
}

export async function buildNewsletterMessageContent(
    options: BuildNewsletterContentOptions,
    content: WaSendMessageContent
): Promise<WaNewsletterBuiltContent> {
    if (typeof content === 'string') {
        const message: Proto.IMessage = { conversation: content }
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
        const message = buildMediaProtoMessage(content, upload)
        return {
            kind: 'media',
            plaintext: proto.Message.encode(message).finish(),
            mediaType: resolveSendMediaKind(content),
            upload
        }
    }

    const protoMessage = content
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
