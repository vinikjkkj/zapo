export const WA_PRESENCE_TYPES = Object.freeze({
    AVAILABLE: 'available',
    UNAVAILABLE: 'unavailable',
    SUBSCRIBE: 'subscribe'
} as const)

export const WA_PRESENCE_LAST_SENTINELS = Object.freeze({
    DENY: 'deny',
    NONE: 'none',
    ERROR: 'error'
} as const)

export const WA_CHATSTATE_MEDIA = Object.freeze({
    AUDIO: 'audio'
} as const)

export type WaPresenceType = (typeof WA_PRESENCE_TYPES)[keyof typeof WA_PRESENCE_TYPES]
export type WaPresenceLastSentinel =
    (typeof WA_PRESENCE_LAST_SENTINELS)[keyof typeof WA_PRESENCE_LAST_SENTINELS]
export type WaChatstateMedia = (typeof WA_CHATSTATE_MEDIA)[keyof typeof WA_CHATSTATE_MEDIA]
