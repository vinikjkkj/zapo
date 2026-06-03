import type { MediaCryptoType } from '@media/types'
import { unwrapMessage } from '@message/encode/content'
import type { Proto } from '@proto'
import { longToNumber } from '@util/primitives'

/**
 * Decrypted media metadata pulled out of a message, carrying everything a CDN
 * download needs (see `downloadMediaMessage`). Binary fields are raw
 * `Uint8Array`s exactly as the protobuf message carried them - never base64
 * strings.
 */
export interface WaResolvedMediaPayload {
    /** Crypto/HKDF domain for the kind: image, video, gif, audio, ptt, document, sticker, ptv. */
    readonly mediaType: MediaCryptoType
    /** Server-relative path (or absolute URL) of the encrypted blob on the media CDN. */
    readonly directPath: string
    /** Media key used to derive the AES/MAC keys. Sensitive key material - do not log. */
    readonly mediaKey: Uint8Array
    /** SHA-256 of the decrypted file, when the message carried it. */
    readonly fileSha256?: Uint8Array
    /** SHA-256 of the encrypted file, when the message carried it. */
    readonly fileEncSha256?: Uint8Array
    /** Declared MIME type, when present. */
    readonly mimetype?: string
    /** Declared plaintext length in bytes, when present. */
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

/**
 * Extracts the downloadable media metadata from a message, unwrapping
 * ephemeral / view-once / document-with-caption envelopes first.
 *
 * Returns `null` when `message` is absent, carries no media, or the media node
 * lacks the `directPath` / `mediaKey` needed to fetch and decrypt the blob (a
 * non-`Uint8Array` `mediaKey` also yields `null`). Supported kinds: image,
 * video (gif when `gifPlayback`), audio (ptt when `ptt`), document, sticker,
 * ptv.
 *
 * @example
 * ```ts
 * const payload = resolveMediaPayload(event.message)
 * if (payload) {
 *     // payload.directPath, payload.mediaKey, payload.fileEncSha256, ...
 * }
 * ```
 */
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
