export const WA_PRIVACY_TOKEN_TYPES = Object.freeze({
    TRUSTED_CONTACT: 'trusted_contact'
} as const)

export const WA_PRIVACY_TOKEN_TAGS = Object.freeze({
    TOKENS: 'tokens',
    TOKEN: 'token',
    TC_TOKEN: 'tctoken',
    CS_TOKEN: 'cstoken'
} as const)

export const WA_PRIVACY_TOKEN_NOTIFICATION_TYPE = 'privacy_token'

export const WA_TC_TOKEN_DEFAULTS = Object.freeze({
    DURATION_S: 604_800,
    NUM_BUCKETS: 4,
    SENDER_DURATION_S: 604_800,
    SENDER_NUM_BUCKETS: 4,
    MAX_DURATION_S: 15_552_000
} as const)
