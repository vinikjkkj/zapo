import type { Proto } from '@proto'

import type { WaLinkPreviewResolved } from './types'

export interface WaLinkPreviewThumbnailFields {
    readonly jpegThumbnail?: Uint8Array
    readonly thumbnailDirectPath?: string
    readonly thumbnailSha256?: Uint8Array
    readonly thumbnailEncSha256?: Uint8Array
    readonly mediaKey?: Uint8Array
    readonly mediaKeyTimestamp?: number
    readonly thumbnailWidth?: number
    readonly thumbnailHeight?: number
}

export function buildExtendedTextWithPreview(
    text: string,
    resolved: WaLinkPreviewResolved,
    thumbnailFields: WaLinkPreviewThumbnailFields
): Proto.IMessage {
    const message: Proto.Message.IExtendedTextMessage = {
        text,
        matchedText: resolved.matchedText,
        previewType: resolved.previewType
    }
    if (resolved.title !== undefined) message.title = resolved.title
    if (resolved.description !== undefined) message.description = resolved.description
    if (thumbnailFields.jpegThumbnail !== undefined) {
        message.jpegThumbnail = thumbnailFields.jpegThumbnail
    }
    if (thumbnailFields.thumbnailDirectPath !== undefined) {
        message.thumbnailDirectPath = thumbnailFields.thumbnailDirectPath
    }
    if (thumbnailFields.thumbnailSha256 !== undefined) {
        message.thumbnailSha256 = thumbnailFields.thumbnailSha256
    }
    if (thumbnailFields.thumbnailEncSha256 !== undefined) {
        message.thumbnailEncSha256 = thumbnailFields.thumbnailEncSha256
    }
    if (thumbnailFields.mediaKey !== undefined) {
        message.mediaKey = thumbnailFields.mediaKey
    }
    if (thumbnailFields.mediaKeyTimestamp !== undefined) {
        message.mediaKeyTimestamp = thumbnailFields.mediaKeyTimestamp
    }
    if (thumbnailFields.thumbnailWidth !== undefined) {
        message.thumbnailWidth = thumbnailFields.thumbnailWidth
    }
    if (thumbnailFields.thumbnailHeight !== undefined) {
        message.thumbnailHeight = thumbnailFields.thumbnailHeight
    }
    return { extendedTextMessage: message }
}
