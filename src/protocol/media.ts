import { TEXT_ENCODER } from '@util/bytes'

const IMAGE_KEYS = TEXT_ENCODER.encode('WhatsApp Image Keys')
const VIDEO_KEYS = TEXT_ENCODER.encode('WhatsApp Video Keys')
const AUDIO_KEYS = TEXT_ENCODER.encode('WhatsApp Audio Keys')
const HISTORY_KEYS = TEXT_ENCODER.encode('WhatsApp History Keys')

export const WA_MEDIA_HKDF_INFO = Object.freeze({
    document: TEXT_ENCODER.encode('WhatsApp Document Keys'),
    image: IMAGE_KEYS,
    sticker: IMAGE_KEYS,
    'xma-image': IMAGE_KEYS,
    video: VIDEO_KEYS,
    gif: VIDEO_KEYS,
    audio: AUDIO_KEYS,
    ptt: AUDIO_KEYS,
    'md-app-state': TEXT_ENCODER.encode('WhatsApp App State Keys'),
    'md-msg-hist': HISTORY_KEYS,
    history: HISTORY_KEYS,
    'sticker-pack': TEXT_ENCODER.encode('WhatsApp Sticker Pack Keys'),
    'thumbnail-sticker-pack': TEXT_ENCODER.encode('WhatsApp Sticker Pack Thumbnail Keys'),
    'thumbnail-link': TEXT_ENCODER.encode('WhatsApp Link Thumbnail Keys')
} as const)

export const WA_PREVIEW_MEDIA_HKDF_INFO = TEXT_ENCODER.encode('Messenger Preview Keys')

export function getWaMediaHkdfInfo(mediaType: string): Uint8Array {
    const info = WA_MEDIA_HKDF_INFO[mediaType as keyof typeof WA_MEDIA_HKDF_INFO]
    if (info !== undefined) return info
    throw new Error(`unsupported media type: ${mediaType}`)
}
