import { bytesToBase64 } from 'zapo-js/util'

export const rand = (min: number, max: number): number => min + Math.random() * (max - min)
export const randInt = (min: number, max: number): number => Math.floor(rand(min, max))
export const randHex = (len: number): string =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 16).toString(16)).join('')

/** `len` random base36 chars (0-9a-z) — WA's short session ids (e.g. `userActivitySessionId`) are base36, not hex. */
export const randBase36 = (len: number): string =>
    Array.from({ length: len }, () => Math.floor(Math.random() * 36).toString(36)).join('')

/** A v4-shaped UUID (crypto.randomUUID format) for the session/funnel ids WA sets as UUIDs. */
export const randUuid = (): string => {
    const variant = (8 + Math.floor(Math.random() * 4)).toString(16)
    return `${randHex(8)}-${randHex(4)}-4${randHex(3)}-${variant}${randHex(3)}-${randHex(12)}`
}

/** base64 of `nBytes` random bytes with WA's `getChatThreadID` `/`→`-` convention (threadId is base64(HMAC), not hex). */
export const randB64 = (nBytes: number): string => {
    const bytes = Uint8Array.from({ length: nBytes }, () => Math.floor(Math.random() * 256))
    return bytesToBase64(bytes).replace(/\//g, '-')
}
