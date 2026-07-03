import type { BinaryNode } from 'zapo-js'
import { isGroupJid } from 'zapo-js/protocol'

export type WamCiphertextTypeKey =
    | 'MESSAGE'
    | 'PREKEY_MESSAGE'
    | 'SENDER_KEY_MESSAGE'
    | 'MESSAGE_SECRET_MESSAGE'

export type WamE2eDestinationKey = 'INDIVIDUAL' | 'GROUP' | 'STATUS' | 'CHANNEL'

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

/** Depth-first search for the first `<enc>` node (direct, group `skmsg`, or nested under `<participants>`). */
export function findFirstEncNode(node: BinaryNode): BinaryNode | null {
    const content = node.content
    if (!Array.isArray(content)) return null
    for (const child of content) {
        if (child.tag === 'enc') return child
        const nested = findFirstEncNode(child)
        if (nested !== null) return nested
    }
    return null
}

/** `<enc type>` attr → E2E_CIPHERTEXT_TYPE enum key. */
export function ciphertextTypeKey(encType: string | undefined): WamCiphertextTypeKey | null {
    switch (encType) {
        case 'msg':
            return 'MESSAGE'
        case 'pkmsg':
            return 'PREKEY_MESSAGE'
        case 'skmsg':
            return 'SENDER_KEY_MESSAGE'
        case 'msmsg':
            return 'MESSAGE_SECRET_MESSAGE'
        default:
            return null
    }
}

/** `<message to>` jid → E2E_DESTINATION enum key. */
export function e2eDestinationKey(to: string): WamE2eDestinationKey {
    if (isGroupJid(to)) return 'GROUP'
    if (to === 'status@broadcast') return 'STATUS'
    if (to.endsWith('@newsletter')) return 'CHANNEL'
    return 'INDIVIDUAL'
}

const MEDIA_TYPE_BY_ATTR: Readonly<Record<string, WamMediaTypeKey>> = {
    image: 'PHOTO',
    video: 'VIDEO',
    audio: 'AUDIO',
    ptt: 'PTT',
    document: 'DOCUMENT',
    sticker: 'STICKER',
    gif: 'GIF',
    contact: 'CONTACT',
    location: 'LOCATION'
}

/** `<enc mediatype>` attr → MEDIA_TYPE enum key (null for text / unknown). */
export function mediaTypeKey(mediatype: string | undefined): WamMediaTypeKey | null {
    if (mediatype === undefined) return null
    return MEDIA_TYPE_BY_ATTR[mediatype] ?? null
}
