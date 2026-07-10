import type { BinaryNode } from 'zapo-js'
import { proto } from 'zapo-js/proto'
import {
    isGroupJid,
    isNewsletterJid,
    isStatusBroadcastJid,
    WA_EDIT_ATTRS,
    WA_ENC_CIPHERTEXT_TYPES,
    WA_ENC_MEDIA_TYPES,
    WA_MESSAGE_TAGS
} from 'zapo-js/protocol'

export type WamCiphertextTypeKey =
    | 'MESSAGE'
    | 'PREKEY_MESSAGE'
    | 'SENDER_KEY_MESSAGE'
    | 'MESSAGE_SECRET_MESSAGE'

export type WamE2eDestinationKey = 'INDIVIDUAL' | 'GROUP' | 'STATUS' | 'CHANNEL'

export type WamEditTypeKey = 'EDITED' | 'PIN' | 'SENDER_REVOKE' | 'ADMIN_REVOKE'

export type WamMediaTypeKey =
    | 'PHOTO'
    | 'VIDEO'
    | 'AUDIO'
    | 'PTT'
    | 'DOCUMENT'
    | 'STICKER'
    | 'GIF'
    | 'CONTACT'
    | 'LOCATION'

export type WamPinInChatTypeKey = 'PIN_FOR_ALL' | 'UNPIN_FOR_ALL'

/** Maps a `pinInChatMessage.type` proto enum to its WAM `PIN_IN_CHAT_TYPE` key. */
export function pinInChatTypeKey(type: number | null | undefined): WamPinInChatTypeKey | null {
    if (type === proto.Message.PinInChatMessage.Type.PIN_FOR_ALL) return 'PIN_FOR_ALL'
    if (type === proto.Message.PinInChatMessage.Type.UNPIN_FOR_ALL) return 'UNPIN_FOR_ALL'
    return null
}

/** Depth-first search for the first `<enc>` node (direct, group `skmsg`, or nested under `<participants>`). */
export function findFirstEncNode(node: BinaryNode): BinaryNode | null {
    const content = node.content
    if (!Array.isArray(content)) return null
    for (const child of content) {
        if (child.tag === WA_MESSAGE_TAGS.ENC) return child
        const nested = findFirstEncNode(child)
        if (nested !== null) return nested
    }
    return null
}

/** `<enc type>` attr → E2E_CIPHERTEXT_TYPE enum key. */
export function ciphertextTypeKey(encType: string | undefined): WamCiphertextTypeKey | null {
    switch (encType) {
        case WA_ENC_CIPHERTEXT_TYPES.MESSAGE:
            return 'MESSAGE'
        case WA_ENC_CIPHERTEXT_TYPES.PREKEY:
            return 'PREKEY_MESSAGE'
        case WA_ENC_CIPHERTEXT_TYPES.SENDER_KEY:
            return 'SENDER_KEY_MESSAGE'
        case WA_ENC_CIPHERTEXT_TYPES.MESSAGE_SECRET:
            return 'MESSAGE_SECRET_MESSAGE'
        default:
            return null
    }
}

/** `<message to>` jid → E2E_DESTINATION enum key. */
export function e2eDestinationKey(to: string): WamE2eDestinationKey {
    if (isGroupJid(to)) return 'GROUP'
    if (isStatusBroadcastJid(to)) return 'STATUS'
    if (isNewsletterJid(to)) return 'CHANNEL'
    return 'INDIVIDUAL'
}

const MEDIA_TYPE_BY_ATTR: Readonly<Record<string, WamMediaTypeKey>> = {
    [WA_ENC_MEDIA_TYPES.IMAGE]: 'PHOTO',
    [WA_ENC_MEDIA_TYPES.VIDEO]: 'VIDEO',
    [WA_ENC_MEDIA_TYPES.AUDIO]: 'AUDIO',
    [WA_ENC_MEDIA_TYPES.PTT]: 'PTT',
    [WA_ENC_MEDIA_TYPES.DOCUMENT]: 'DOCUMENT',
    [WA_ENC_MEDIA_TYPES.STICKER]: 'STICKER',
    [WA_ENC_MEDIA_TYPES.GIF]: 'GIF',
    contact: 'CONTACT',
    [WA_ENC_MEDIA_TYPES.LOCATION]: 'LOCATION'
}

/** `<enc mediatype>` attr → MEDIA_TYPE enum key (null for text / unknown). */
export function mediaTypeKey(mediatype: string | undefined): WamMediaTypeKey | null {
    if (mediatype === undefined) return null
    return MEDIA_TYPE_BY_ATTR[mediatype] ?? null
}

/** `<message edit>` attr → EDIT_TYPE enum key (null when the message is not an edit/revoke). */
export function editTypeKey(edit: string | undefined): WamEditTypeKey | null {
    switch (edit) {
        case WA_EDIT_ATTRS.MESSAGE_EDIT:
        case WA_EDIT_ATTRS.NEWSLETTER_EDIT:
            return 'EDITED'
        case WA_EDIT_ATTRS.PIN_IN_CHAT:
            return 'PIN'
        case WA_EDIT_ATTRS.SENDER_REVOKE:
            return 'SENDER_REVOKE'
        case WA_EDIT_ATTRS.ADMIN_REVOKE:
            return 'ADMIN_REVOKE'
        default:
            return null
    }
}

export type WamDocumentTypeKey =
    | 'OTHER'
    | 'IMAGE'
    | 'VIDEO'
    | 'AUDIO'
    | 'DOCUMENT'
    | 'COMPRESSED_FILE'
    | 'EXECUTABLE'
    | 'VCARD'

/** Lowercase file extension from a document `fileName`, when present. */
export function fileExtension(fileName: string | null | undefined): string | undefined {
    if (!fileName) return undefined
    const dot = fileName.lastIndexOf('.')
    if (dot <= 0 || dot === fileName.length - 1) return undefined
    return fileName.slice(dot + 1).toLowerCase()
}

/** Document `mimetype` → DOCUMENT_TYPE enum key. */
export function documentTypeFor(mimetype: string | null | undefined): WamDocumentTypeKey {
    const mime = (mimetype ?? '').toLowerCase()
    if (mime.startsWith('image/')) return 'IMAGE'
    if (mime.startsWith('video/')) return 'VIDEO'
    if (mime.startsWith('audio/')) return 'AUDIO'
    if (mime.includes('vcard')) return 'VCARD'
    if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z') || mime.includes('tar'))
        return 'COMPRESSED_FILE'
    if (mime.includes('msdownload') || mime.includes('executable') || mime.includes('x-msdos'))
        return 'EXECUTABLE'
    if (
        mime.includes('pdf') ||
        mime.includes('word') ||
        mime.includes('document') ||
        mime.includes('sheet') ||
        mime.includes('presentation') ||
        mime.startsWith('text/')
    )
        return 'DOCUMENT'
    return 'OTHER'
}
