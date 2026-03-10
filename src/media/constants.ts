export const DEFAULT_MEDIA_HOSTS = ['mmg.whatsapp.net', 'mmg-fallback.whatsapp.net'] as const
export const MEDIA_CONN_CACHE_GRACE_MS = 30_000

export const MEDIA_HKDF_SIZE = 112
export const IV_SIZE = 16
export const ENC_KEY_START = 16
export const ENC_KEY_END = 48
export const MAC_KEY_START = 48
export const MAC_KEY_END = 80
export const HMAC_TRUNCATED_SIZE = 10

export const MEDIA_UPLOAD_PATHS: Readonly<Record<'image' | 'video' | 'audio' | 'document' | 'sticker' | 'gif' | 'ptt', string>> =
    Object.freeze({
        image: '/mms/image',
        video: '/mms/video',
        audio: '/mms/audio',
        document: '/mms/document',
        sticker: '/mms/sticker',
        gif: '/mms/gif',
        ptt: '/mms/ptt'
    })
