import { timingSafeEqual } from 'node:crypto'
import type { Readable } from 'node:stream'

export const TEXT_ENCODER = new TextEncoder()
export const TEXT_DECODER = new TextDecoder()
export const ZERO_BYTES: Readonly<Uint8Array> = new Uint8Array([0])
export const EMPTY_BYTES = Object.freeze(new Uint8Array(0))

const HEX_CHARS = '0123456789abcdef'

const HEX_TABLE = /* @__PURE__ */ (() => {
    const table = new Array<string>(256)
    for (let i = 0; i < 256; i += 1) {
        table[i] = HEX_CHARS[i >> 4] + HEX_CHARS[i & 0x0f]
    }
    return table
})()

const HEX_LOOKUP = /* @__PURE__ */ (() => {
    const table = new Int8Array(128).fill(-1)
    for (let i = 0x30; i <= 0x39; i += 1) table[i] = i - 0x30
    for (let i = 0x41; i <= 0x46; i += 1) table[i] = i - 0x41 + 10
    for (let i = 0x61; i <= 0x66; i += 1) table[i] = i - 0x61 + 10
    return table
})()

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

const BASE64_LOOKUP = /* @__PURE__ */ (() => {
    const table = new Uint8Array(128).fill(0xff)
    for (let i = 0; i < BASE64_CHARS.length; i += 1) {
        table[BASE64_CHARS.charCodeAt(i)] = i
    }
    table[0x3d] = 0 // '='
    return table
})()

/**
 * Encodes a Uint8Array to a hex string
 */
export function bytesToHex(value: Uint8Array): string {
    let out = ''
    for (let i = 0; i < value.length; i += 1) {
        out += HEX_TABLE[value[i]]
    }
    return out
}

/**
 * Decodes a hex string to a Uint8Array
 */
export function hexToBytes(value: string): Uint8Array {
    const len = value.length
    if (len & 1) {
        throw new Error('hex string must have even length')
    }
    const out = new Uint8Array(len >> 1)
    for (let i = 0; i < len; i += 2) {
        const hiCode = value.charCodeAt(i)
        const loCode = value.charCodeAt(i + 1)
        const hi = hiCode < 128 ? HEX_LOOKUP[hiCode] : -1
        const lo = loCode < 128 ? HEX_LOOKUP[loCode] : -1
        if ((hi | lo) < 0) {
            throw new Error('invalid hex character')
        }
        out[i >> 1] = (hi << 4) | lo
    }
    return out
}

export function bytesToBase64(value: Uint8Array): string {
    return encodeBase64(value, BASE64_CHARS, true)
}

export function base64ToBytes(value: string): Uint8Array {
    const len = value.length
    if (len === 0) return EMPTY_BYTES
    if ((len & 3) !== 0) {
        throw new Error('base64 string length must be multiple of 4')
    }

    let padding = 0
    if (value.charCodeAt(len - 1) === 0x3d) padding += 1
    if (value.charCodeAt(len - 2) === 0x3d) padding += 1

    const outLen = ((len * 3) >> 2) - padding
    const out = new Uint8Array(outLen)
    let j = 0

    const mainLen = len - 4
    let i = 0
    for (; i < mainLen; i += 4) {
        const a = lookupBase64(value.charCodeAt(i))
        const b = lookupBase64(value.charCodeAt(i + 1))
        const c = lookupBase64(value.charCodeAt(i + 2))
        const d = lookupBase64(value.charCodeAt(i + 3))
        out[j++] = (a << 2) | (b >> 4)
        out[j++] = ((b & 0x0f) << 4) | (c >> 2)
        out[j++] = ((c & 0x03) << 6) | d
    }

    const a = lookupBase64(value.charCodeAt(i))
    const b = lookupBase64(value.charCodeAt(i + 1))
    out[j++] = (a << 2) | (b >> 4)
    if (j < outLen) {
        const c = lookupBase64(value.charCodeAt(i + 2))
        out[j++] = ((b & 0x0f) << 4) | (c >> 2)
        if (j < outLen) {
            const d = lookupBase64(value.charCodeAt(i + 3))
            out[j++] = ((c & 0x03) << 6) | d
        }
    }

    return out
}

export function base64ToBytesChecked(
    value: string,
    field: string,
    requireNonEmpty = true
): Uint8Array {
    if (requireNonEmpty && value.length === 0) {
        throw new Error(`invalid base64 payload for ${field}`)
    }
    return base64ToBytes(value)
}

export function decodeBase64Url(value: string | undefined, field: string): Uint8Array {
    if (!value) {
        throw new Error(`missing ${field}`)
    }
    const padded = value
        .replace(/-/g, '+')
        .replace(/_/g, '/')
        .padEnd(Math.ceil(value.length / 4) * 4, '=')
    return base64ToBytesChecked(padded, field)
}

export function assertByteLength(
    value: Uint8Array,
    expectedLength: number,
    errorMessage: string
): void {
    if (value.length !== expectedLength) {
        throw new Error(errorMessage)
    }
}

export function decodeProtoBytes(
    value: Uint8Array | string | null | undefined,
    field: string
): Uint8Array {
    if (value === null || value === undefined) {
        throw new Error(`missing protobuf bytes field ${field}`)
    }
    if (value instanceof Uint8Array) {
        return value
    }
    return base64ToBytes(value)
}

function lookupBase64(code: number): number {
    if (code > 127) {
        throw new Error('invalid base64 character')
    }
    const v = BASE64_LOOKUP[code]
    if (v === 0xff) {
        throw new Error('invalid base64 character')
    }
    return v
}

/**
 * Encodes a Uint8Array to a base64url string (URL-safe, no padding)
 */
export function bytesToBase64UrlSafe(value: Uint8Array): string {
    return encodeBase64(value, BASE64URL_CHARS, false)
}

function encodeBase64(value: Uint8Array, alphabet: string, pad: boolean): string {
    const len = value.length
    if (len === 0) return ''
    const remainder = len % 3
    const mainLen = len - remainder
    const chunks = Math.ceil(len / 3)
    const out = new Array<string>(pad ? chunks * 4 : Math.ceil((len * 4) / 3))
    let k = 0

    for (let i = 0; i < mainLen; i += 3) {
        const a = value[i]
        const b = value[i + 1]
        const c = value[i + 2]
        out[k++] = alphabet[a >> 2]
        out[k++] = alphabet[((a & 0x03) << 4) | (b >> 4)]
        out[k++] = alphabet[((b & 0x0f) << 2) | (c >> 6)]
        out[k++] = alphabet[c & 0x3f]
    }

    if (remainder === 1) {
        const a = value[mainLen]
        out[k++] = alphabet[a >> 2]
        out[k++] = alphabet[(a & 0x03) << 4]
        if (pad) {
            out[k++] = '='
            out[k++] = '='
        }
    } else if (remainder === 2) {
        const a = value[mainLen]
        const b = value[mainLen + 1]
        out[k++] = alphabet[a >> 2]
        out[k++] = alphabet[((a & 0x03) << 4) | (b >> 4)]
        out[k++] = alphabet[(b & 0x0f) << 2]
        if (pad) {
            out[k++] = '='
        }
    }

    return out.join('')
}

export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
    const total = parts.reduce((sum, current) => sum + current.length, 0)
    const out = new Uint8Array(total)
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

export function toBytesView(value: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
    if (value instanceof Uint8Array) {
        return value.constructor === Uint8Array
            ? value
            : new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    }
    if (value instanceof ArrayBuffer) {
        return new Uint8Array(value)
    }
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
}

export function toChunkBytes(chunk: unknown): Uint8Array {
    if (typeof chunk === 'string') {
        return TEXT_ENCODER.encode(chunk)
    }
    if (chunk instanceof Uint8Array || chunk instanceof ArrayBuffer || ArrayBuffer.isView(chunk)) {
        return toBytesView(chunk)
    }
    throw new Error(`unsupported stream chunk type: ${typeof chunk}`)
}

export function uint8TimingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.byteLength !== right.byteLength) {
        return false
    }
    return timingSafeEqual(left, right)
}

export function uint8Equal(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) {
        return false
    }
    let diff = 0
    for (let i = 0; i < a.length; i += 1) {
        diff |= a[i] ^ b[i]
    }
    return diff === 0
}

export function removeAt<T>(items: readonly T[], index: number): T[] {
    const out: T[] = []
    for (let i = 0; i < items.length; i += 1) {
        if (i !== index) {
            out.push(items[i])
        }
    }
    return out
}

export function intToBytes(byteLength: number, value: number): Uint8Array {
    if (!Number.isSafeInteger(value) || value < 0) {
        throw new Error(`invalid integer value: ${value}`)
    }
    const out = new Uint8Array(byteLength)
    let current = value
    for (let i = byteLength - 1; i >= 0; i -= 1) {
        out[i] = current & 0xff
        current = Math.floor(current / 256)
    }
    return out
}

export async function readAllBytes(
    stream: Readable,
    options: { readonly maxBytes?: number } = {}
): Promise<Uint8Array> {
    const maxBytes = options.maxBytes
    if (maxBytes !== undefined && (!Number.isSafeInteger(maxBytes) || maxBytes < 0)) {
        throw new Error(`invalid max bytes limit: ${maxBytes}`)
    }
    const chunks: Uint8Array[] = []
    let total = 0
    for await (const chunk of stream) {
        const bytes = toChunkBytes(chunk)
        chunks.push(bytes)
        total += bytes.byteLength
        if (maxBytes !== undefined && total > maxBytes) {
            const error = new Error(`stream exceeded max bytes limit (${maxBytes})`)
            stream.destroy(error)
            throw error
        }
    }

    if (total === 0) {
        return EMPTY_BYTES
    }
    if (chunks.length === 1) {
        return chunks[0]
    }

    return concatBytes(chunks)
}
