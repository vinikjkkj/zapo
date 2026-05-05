import { sha256 } from '@crypto/core'
import { WA_DEFAULTS } from '@protocol/constants'
import { bytesToBase64 } from '@util/bytes'

const PHASH_DIGEST_PREFIX = 6

const CHAR_DOT = 0x2e
const CHAR_ZERO = 0x30
const CHAR_COLON = 0x3a
const CHAR_AT = 0x40
const CHAR_C = 0x63
const CHAR_U = 0x75
const CHAR_S = 0x73

const MAX_PARTICIPANTS = 2048
const PER_WID_BYTES = 96

// Module scratch reused across calls. Safe because every call's sync
// prep + `sha256(parts).update(...)` consumes the bytes before the
// awaited `Promise.resolve(...)` yields — the next call's overwrite
// can't reach an in-flight digest.
const SCRATCH = new Uint8Array(MAX_PARTICIPANTS * PER_WID_BYTES)
const OFFSETS = new Uint32Array(MAX_PARTICIPANTS + 1)
const ORDER = new Uint32Array(MAX_PARTICIPANTS)

export async function computePhashV2(participants: readonly string[]): Promise<string> {
    if (participants.length === 0) return '2:'
    const n = participants.length
    if (n > MAX_PARTICIPANTS) {
        throw new Error(`phash participant count ${n} exceeds MAX_PARTICIPANTS ${MAX_PARTICIPANTS}`)
    }

    let off = 0
    for (let i = 0; i < n; i += 1) {
        OFFSETS[i] = off
        off = writeCanonicalUtf8(SCRATCH, off, participants[i])
    }
    OFFSETS[n] = off

    for (let i = 0; i < n; i += 1) ORDER[i] = i
    ORDER.subarray(0, n).sort((a, b) => compareScratchSlice(SCRATCH, OFFSETS, a, b))

    const parts = new Array<Uint8Array>(n)
    for (let i = 0; i < n; i += 1) {
        const idx = ORDER[i]
        parts[i] = SCRATCH.subarray(OFFSETS[idx], OFFSETS[idx + 1])
    }
    const digest = await sha256(parts)
    return `2:${bytesToBase64(digest.subarray(0, PHASH_DIGEST_PREFIX))}`
}

function writeCanonicalUtf8(out: Uint8Array, start: number, jid: string): number {
    const atIndex = jid.indexOf('@')
    if (atIndex < 1 || atIndex >= jid.length - 1) {
        return writeAscii(out, start, jid, 0, jid.length)
    }

    const colonIndex = jid.indexOf(':', 0)
    const userEnd = colonIndex >= 0 && colonIndex < atIndex ? colonIndex : atIndex
    const hasZeroAgent =
        userEnd >= 2 &&
        jid.charCodeAt(userEnd - 2) === CHAR_DOT &&
        jid.charCodeAt(userEnd - 1) === CHAR_ZERO
    const baseUserEnd = hasZeroAgent ? userEnd - 2 : userEnd

    let off = writeAscii(out, start, jid, 0, baseUserEnd)
    out[off++] = CHAR_DOT
    out[off++] = CHAR_ZERO
    out[off++] = CHAR_COLON

    let device = 0
    if (colonIndex >= 0 && colonIndex < atIndex) {
        for (let i = colonIndex + 1; i < atIndex; i += 1) {
            const digit = jid.charCodeAt(i) - CHAR_ZERO
            if (digit < 0 || digit > 9) {
                device = 0
                break
            }
            device = device * 10 + digit
            if (device > Number.MAX_SAFE_INTEGER) {
                device = 0
                break
            }
        }
    }
    off = writeUintAscii(out, off, device)
    out[off++] = CHAR_AT

    const serverStart = atIndex + 1
    const serverLen = jid.length - serverStart
    const isCUs =
        serverLen === 4 &&
        jid.charCodeAt(serverStart) === CHAR_C &&
        jid.charCodeAt(serverStart + 1) === CHAR_DOT &&
        jid.charCodeAt(serverStart + 2) === CHAR_U &&
        jid.charCodeAt(serverStart + 3) === CHAR_S
    if (isCUs) {
        off = writeAscii(out, off, WA_DEFAULTS.HOST_DOMAIN, 0, WA_DEFAULTS.HOST_DOMAIN.length)
    } else {
        off = writeAscii(out, off, jid, serverStart, jid.length)
    }
    return off
}

function writeAscii(
    out: Uint8Array,
    outOff: number,
    str: string,
    start: number,
    end: number
): number {
    for (let i = start; i < end; i += 1) {
        out[outOff + (i - start)] = str.charCodeAt(i)
    }
    return outOff + (end - start)
}

function writeUintAscii(out: Uint8Array, off: number, value: number): number {
    if (value === 0) {
        out[off] = CHAR_ZERO
        return off + 1
    }
    let temp = value
    let digits = 0
    while (temp > 0) {
        digits += 1
        temp = (temp - (temp % 10)) / 10
    }
    let cursor = off + digits - 1
    let v = value
    while (v > 0) {
        out[cursor] = CHAR_ZERO + (v % 10)
        cursor -= 1
        v = (v - (v % 10)) / 10
    }
    return off + digits
}

function compareScratchSlice(
    scratch: Uint8Array,
    offsets: Uint32Array,
    a: number,
    b: number
): number {
    const aStart = offsets[a]
    const aEnd = offsets[a + 1]
    const bStart = offsets[b]
    const bEnd = offsets[b + 1]
    const aLen = aEnd - aStart
    const bLen = bEnd - bStart
    const cmpLen = aLen < bLen ? aLen : bLen
    for (let k = 0; k < cmpLen; k += 1) {
        const av = scratch[aStart + k]
        const bv = scratch[bStart + k]
        if (av !== bv) return av - bv
    }
    return aLen - bLen
}
