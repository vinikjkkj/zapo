export const WA_EMAIL_XMLNS = 'urn:xmpp:whatsapp:account'

export const WA_EMAIL_TAGS = Object.freeze({
    EMAIL: 'email',
    EMAIL_ADDRESS: 'email_address',
    VERIFY_EMAIL: 'verify_email',
    CONFIRM_EMAIL: 'confirm_email',
    CONTEXT: 'context',
    CODE: 'code',
    LG: 'lg',
    LC: 'lc',
    AUTO_VERIFY: 'auto_verify',
    CONFIRMED: 'confirmed'
} as const)

export const WA_EMAIL_CONTEXTS = Object.freeze({
    ONBOARDING: 'onboarding',
    SETTINGS: 'settings'
} as const)

export type WaEmailContext = (typeof WA_EMAIL_CONTEXTS)[keyof typeof WA_EMAIL_CONTEXTS]

export const WA_EMAIL_LIMITS = Object.freeze({
    EMAIL_MAX_LENGTH: 320,
    CODE_LENGTH: 6,
    LOCALE_MIN_LENGTH: 2,
    LOCALE_MAX_LENGTH: 3
} as const)

export const WA_EMAIL_ERROR_CODES = Object.freeze({
    FORBIDDEN: 403,
    LOCKOUT: 534,
    CODE_EXPIRED: 535,
    CODE_INCORRECT: 536,
    TOO_MANY_RETRIES: 537
} as const)

export type WaEmailErrorCode = (typeof WA_EMAIL_ERROR_CODES)[keyof typeof WA_EMAIL_ERROR_CODES]
