import { Binary } from 'mongodb'
import { bytesToHex, normalizeQueryLimit, toBytesView, uint8Equal } from 'zapo-js/util'

export function toBinary(bytes: Uint8Array): Binary {
    return new Binary(bytes)
}

export function fromBinary(value: unknown): Uint8Array {
    if (value instanceof Binary) {
        const buf = value.buffer
        return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength)
    }
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) return toBytesView(value)
    throw new Error('expected binary data')
}

export function fromBinaryOrNull(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) return null
    return fromBinary(value)
}

const SAFE_PREFIX_RE = /^[A-Za-z0-9_]*$/

export function assertSafeCollectionPrefix(prefix: string): void {
    if (!SAFE_PREFIX_RE.test(prefix)) {
        throw new Error('collectionPrefix must contain only letters, numbers, and underscores')
    }
}

export { bytesToHex, normalizeQueryLimit as safeLimit, uint8Equal }
