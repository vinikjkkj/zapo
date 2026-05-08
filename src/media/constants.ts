export const DEFAULT_MEDIA_HOSTS = Object.freeze([
    'mmg.whatsapp.net',
    'mmg-fallback.whatsapp.net'
] as const)
export const MEDIA_CONN_CACHE_GRACE_MS = 30_000

export const MEDIA_HKDF_SIZE = 112
export const IV_SIZE = 16
export const ENC_KEY_START = 16
export const ENC_KEY_END = 48
export const MAC_KEY_START = 48
export const MAC_KEY_END = 80
export const HMAC_TRUNCATED_SIZE = 10
export const SIDECAR_CHUNK_SIZE = 65_536
export const SIDECAR_HMAC_SIZE = 10

export const MEDIA_UPLOAD_PATHS: Readonly<
    Record<'image' | 'video' | 'audio' | 'document' | 'sticker' | 'gif' | 'ptt' | 'ptv', string>
> = Object.freeze({
    image: '/mms/image',
    video: '/mms/video',
    audio: '/mms/audio',
    document: '/mms/document',
    sticker: '/mms/sticker',
    gif: '/mms/gif',
    ptt: '/mms/ptt',
    ptv: '/mms/video'
})

export type NewsletterMediaKind =
    | 'image'
    | 'video'
    | 'audio'
    | 'document'
    | 'sticker'
    | 'sticker-pack'
    | 'gif'
    | 'ptt'
    | 'ptv'
    | 'thumbnail-link'

export const NEWSLETTER_MEDIA_UPLOAD_PATHS: Readonly<Record<NewsletterMediaKind, string>> =
    Object.freeze({
        image: '/newsletter/newsletter-image',
        video: '/newsletter/newsletter-video',
        audio: '/newsletter/newsletter-audio',
        document: '/newsletter/newsletter-document',
        sticker: '/newsletter/newsletter-sticker',
        'sticker-pack': '/newsletter/newsletter-sticker-pack',
        gif: '/newsletter/newsletter-gif',
        ptt: '/newsletter/newsletter-ptt',
        ptv: '/newsletter/newsletter-ptv',
        'thumbnail-link': '/newsletter/newsletter-thumbnail-link'
    })
