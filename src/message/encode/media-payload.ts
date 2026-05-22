import type { MediaCryptoType } from '@media/types'
import { unwrapMessage } from '@message/encode/content'
import type { Proto } from '@proto'
import { longToNumber } from '@util/primitives'

export interface WaResolvedMediaPayload {
    readonly mediaType: MediaCryptoType
    readonly directPath: string
    readonly mediaKey: Uint8Array
    readonly fileSha256?: Uint8Array
    readonly fileEncSha256?: Uint8Array
    readonly mimetype?: string
    readonly fileLength?: number
}

interface DownloadableMediaProtoFields {
    readonly directPath?: string | null
    readonly mediaKey?: Uint8Array | string | null
    readonly fileSha256?: Uint8Array | string | null
    readonly fileEncSha256?: Uint8Array | string | null
    readonly mimetype?: string | null
    readonly fileLength?: number | { toNumber(): number } | null
}

function buildPayload(
    mediaType: MediaCryptoType,
    fields: DownloadableMediaProtoFields
): WaResolvedMediaPayload | null {
    if (!fields.directPath || !fields.mediaKey) {
        return null
    }
    const mediaKey = fields.mediaKey instanceof Uint8Array ? fields.mediaKey : null
    if (!mediaKey) {
        return null
    }
    const fileSha256 = fields.fileSha256 instanceof Uint8Array ? fields.fileSha256 : undefined
    const fileEncSha256 =
        fields.fileEncSha256 instanceof Uint8Array ? fields.fileEncSha256 : undefined
    return {
        mediaType,
        directPath: fields.directPath,
        mediaKey,
        fileSha256,
        fileEncSha256,
        mimetype: fields.mimetype ?? undefined,
        fileLength: fields.fileLength ? longToNumber(fields.fileLength) : undefined
    }
}

export function resolveMediaPayload(
    message: Proto.IMessage | null | undefined
): WaResolvedMediaPayload | null {
    if (!message) return null
    const msg = unwrapMessage(message)

    if (msg.imageMessage) return buildPayload('image', msg.imageMessage)
    if (msg.videoMessage) {
        return buildPayload(msg.videoMessage.gifPlayback ? 'gif' : 'video', msg.videoMessage)
    }
    if (msg.audioMessage) {
        return buildPayload(msg.audioMessage.ptt ? 'ptt' : 'audio', msg.audioMessage)
    }
    if (msg.documentMessage) return buildPayload('document', msg.documentMessage)
    if (msg.stickerMessage) return buildPayload('sticker', msg.stickerMessage)
    if (msg.ptvMessage) return buildPayload('ptv', msg.ptvMessage)
    return null
}
