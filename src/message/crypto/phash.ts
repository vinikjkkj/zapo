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

/**
 * Upper bound on the bytes the canonical rewrite can add to a single jid: the
 * `.0:` agent marker plus a device digit when the input carries neither, plus
 * the `c.us` server substitution.
 */
const CANONICAL_GROWTH_BYTES = 4 + WA_DEFAULTS.HOST_DOMAIN.length

/**
 * Largest canonical buffer kept alive between calls (the index arrays scale
 * with it). Lists above this bound are rare enough that a throwaway allocation
 * beats holding the memory for the life of the process.
 */
const RETAINED_SCRATCH_BYTES = 1024 * 1024

interface PhashBuffers {
    scratch: Uint8Array
    offsets: Uint32Array
    order: Uint32Array
}

const RETAINED: PhashBuffers = {
    scratch: new Uint8Array(0),
    offsets: new Uint32Array(0),
    order: new Uint32Array(0)
}

/**
 * Computes the v2 participant hash (`2:<base64>`) attached to group and
 * broadcast-list fanouts.
 *
 * Every participant is canonicalized to `<user>.0:<device>@<server>`, the set
 * is sorted bytewise and hashed as a single SHA-256 stream. There is no
 * participant ceiling: the canonical buffer grows to fit the list, so a group
 * whose members resolve to tens of thousands of devices still hashes.
 *
 * @param participants device jids, in any order
 * @returns the `2:`-prefixed phash, or `'2:'` when the list is empty
 */
export function computePhashV2(participants: readonly string[]): string {
    const n = participants.length
    if (n === 0) return '2:'

    let requiredBytes = 0
    for (let i = 0; i < n; i += 1) {
        requiredBytes += participants[i].length + CANONICAL_GROWTH_BYTES
    }
    const { scratch, offsets, order } = acquireBuffers(n, requiredBytes)

    let off = 0
    for (let i = 0; i < n; i += 1) {
        offsets[i] = off
        off = writeCanonicalUtf8(scratch, off, participants[i])
    }
    offsets[n] = off
    if (off > scratch.length) {
        throw new Error(
            `phash canonical buffer overflow: needs ${off} bytes, scratch is ${scratch.length}`
        )
    }

    for (let i = 0; i < n; i += 1) order[i] = i
    const ranked = order.subarray(0, n)
    ranked.sort((a, b) => compareScratchSlice(scratch, offsets, a, b))

    const parts = new Array<Uint8Array>(n)
    for (let i = 0; i < n; i += 1) {
        const idx = ranked[i]
        parts[i] = scratch.subarray(offsets[idx], offsets[idx + 1])
    }
    const digest = sha256(parts)
    return `2:${bytesToBase64(digest.subarray(0, PHASH_DIGEST_PREFIX))}`
}

function acquireBuffers(participantCount: number, requiredBytes: number): PhashBuffers {
    if (requiredBytes > RETAINED_SCRATCH_BYTES) {
        return {
            scratch: new Uint8Array(requiredBytes),
            offsets: new Uint32Array(participantCount + 1),
            order: new Uint32Array(participantCount)
        }
    }
    if (RETAINED.scratch.length < requiredBytes) {
        const nextBytes = Math.max(requiredBytes, RETAINED.scratch.length * 2)
        RETAINED.scratch = new Uint8Array(Math.min(RETAINED_SCRATCH_BYTES, nextBytes))
    }
    if (RETAINED.order.length < participantCount) {
        const capacity = Math.max(participantCount, RETAINED.order.length * 2)
        RETAINED.offsets = new Uint32Array(capacity + 1)
        RETAINED.order = new Uint32Array(capacity)
    }
    return RETAINED
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
