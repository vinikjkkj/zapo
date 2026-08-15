export const WA_USERNAME_LIMITS = Object.freeze({
    MIN_LENGTH: 3,
    MAX_LENGTH: 35,
    KEY_LENGTH: 4
} as const)

export const WA_USERNAME_VALIDATION_ERRORS = Object.freeze({
    INVALID_CHARACTER: 'INVALID_CHARACTER',
    INVALID_LENGTH: 'INVALID_LENGTH',
    INVALID_NO_LETTERS: 'INVALID_NO_LETTERS',
    INVALID_PERIODS: 'INVALID_PERIODS',
    INVALID_DOMAIN_SUFFIX: 'INVALID_DOMAIN_SUFFIX',
    INVALID_WWW_PREFIX: 'INVALID_WWW_PREFIX',
    INVALID_WORD: 'INVALID_WORD'
} as const)

export type WaUsernameValidationError =
    (typeof WA_USERNAME_VALIDATION_ERRORS)[keyof typeof WA_USERNAME_VALIDATION_ERRORS]

export type WaUsernameValidation =
    | { readonly isValid: true }
    | { readonly isValid: false; readonly errorType: WaUsernameValidationError }

const VALID_VALIDATION: WaUsernameValidation = Object.freeze({ isValid: true } as const)

const DOMAIN_SUFFIXES: readonly string[] = [
    '.com',
    '.org',
    '.net',
    '.int',
    '.edu',
    '.gov',
    '.mil',
    '.arpa',
    '.html',
    '.htm',
    '.txt',
    '.xml'
]

const RESERVED_WORDS: readonly string[] = ['whatsapp', 'instagram', 'facebook', 'oculus']

function isLetterCode(code: number): boolean {
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

function isAllowedCode(code: number): boolean {
    return isLetterCode(code) || (code >= 48 && code <= 57) || code === 95 || code === 46
}

function invalid(errorType: WaUsernameValidationError): WaUsernameValidation {
    return { isValid: false, errorType }
}

/** Returns the first rule a username fails, in WhatsApp Web's own order. */
export function validateUsernameLocally(username: string): WaUsernameValidation {
    for (let index = 0; index < username.length; index += 1) {
        if (!isAllowedCode(username.charCodeAt(index))) {
            return invalid(WA_USERNAME_VALIDATION_ERRORS.INVALID_CHARACTER)
        }
    }
    if (
        username.length < WA_USERNAME_LIMITS.MIN_LENGTH ||
        username.length > WA_USERNAME_LIMITS.MAX_LENGTH
    ) {
        return invalid(WA_USERNAME_VALIDATION_ERRORS.INVALID_LENGTH)
    }
    let hasLetter = false
    for (let index = 0; index < username.length; index += 1) {
        if (isLetterCode(username.charCodeAt(index))) {
            hasLetter = true
            break
        }
    }
    if (!hasLetter) return invalid(WA_USERNAME_VALIDATION_ERRORS.INVALID_NO_LETTERS)
    if (username.startsWith('.') || username.endsWith('.') || username.includes('..')) {
        return invalid(WA_USERNAME_VALIDATION_ERRORS.INVALID_PERIODS)
    }
    const lowered = username.toLowerCase()
    if (lowered.startsWith('www.')) {
        return invalid(WA_USERNAME_VALIDATION_ERRORS.INVALID_WWW_PREFIX)
    }
    for (let index = 0; index < DOMAIN_SUFFIXES.length; index += 1) {
        if (lowered.endsWith(DOMAIN_SUFFIXES[index])) {
            return invalid(WA_USERNAME_VALIDATION_ERRORS.INVALID_DOMAIN_SUFFIX)
        }
    }
    for (let index = 0; index < RESERVED_WORDS.length; index += 1) {
        if (lowered.includes(RESERVED_WORDS[index])) {
            return invalid(WA_USERNAME_VALIDATION_ERRORS.INVALID_WORD)
        }
    }
    return VALID_VALIDATION
}

export function isValidUsername(username: string): boolean {
    return validateUsernameLocally(username).isValid
}

/** True for the 4-digit numeric username key (recovery PIN). */
export function isUsernameKey(key: string): boolean {
    if (key.length !== WA_USERNAME_LIMITS.KEY_LENGTH) return false
    for (let index = 0; index < key.length; index += 1) {
        const digit = key.charCodeAt(index) - 48
        if (digit < 0 || digit > 9) return false
    }
    return true
}

/**
 * Strips the display-only `@` prefix. The server is not supposed to send it,
 * but WhatsApp Web tolerates and drops it, so stanza and user input alike go
 * through here first.
 */
export function normalizeUsername(username: string): string {
    return username.charCodeAt(0) === 64 ? username.slice(1) : username
}

export function displayUsername(username: string): string {
    return `@${username}`
}

export interface ParsedUsernameHandle {
    readonly username: string
    readonly usernameKey: string | null
}

/**
 * Splits `@user`, `user` or `@user:1234` into its parts without validating
 * either. Callers that need to tell apart a bad handle from a bad key start
 * here; {@link parseUsernameHandle} is the validating shorthand.
 */
export function splitUsernameHandle(input: string): ParsedUsernameHandle {
    const withoutPrefix = normalizeUsername(input.trim())
    const colonIndex = withoutPrefix.indexOf(':')
    if (colonIndex === -1) return { username: withoutPrefix, usernameKey: null }
    return {
        username: withoutPrefix.slice(0, colonIndex),
        usernameKey: withoutPrefix.slice(colonIndex + 1)
    }
}

/** Parses `@user`, `user` or `@user:1234`. `null` when either part is invalid. */
export function parseUsernameHandle(input: string): ParsedUsernameHandle | null {
    const { username, usernameKey } = splitUsernameHandle(input)
    if (!isValidUsername(username)) return null
    if (usernameKey !== null && !isUsernameKey(usernameKey)) return null
    return { username, usernameKey }
}
