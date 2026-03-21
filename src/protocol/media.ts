export const WA_MEDIA_HKDF_INFO = Object.freeze({
    document: 'WhatsApp Document Keys',
    image: 'WhatsApp Image Keys',
    sticker: 'WhatsApp Image Keys',
    'xma-image': 'WhatsApp Image Keys',
    video: 'WhatsApp Video Keys',
    gif: 'WhatsApp Video Keys',
    audio: 'WhatsApp Audio Keys',
    ptt: 'WhatsApp Audio Keys',
    'md-app-state': 'WhatsApp App State Keys',
    'md-msg-hist': 'WhatsApp History Keys',
    history: 'WhatsApp History Keys'
} as const)

export const WA_PREVIEW_MEDIA_HKDF_INFO = 'Messenger Preview Keys'

export function getWaMediaHkdfInfo(mediaType: string): string {
    const info = WA_MEDIA_HKDF_INFO[mediaType as keyof typeof WA_MEDIA_HKDF_INFO]
    if (info !== undefined) return info
    throw new Error(`unsupported media type: ${mediaType}`)
}
