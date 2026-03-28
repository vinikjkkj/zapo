import type Redis from 'ioredis'
import { bytesToHex, hexToBytes, normalizeQueryLimit, toBytesView, uint8Equal } from 'zapo-js/util'

export function toBytes(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) return toBytesView(value)
    throw new Error('expected binary data')
}

export function toBytesOrNull(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) return null
    if (typeof value === 'string' && value.length === 0) return null
    return toBytes(value)
}

export function toStringOrNull(value: string | null | undefined): string | null {
    if (value === null || value === undefined || value.length === 0) return null
    return value
}

export function toNumberOrNull(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value.length === 0) return null
    return Number(value)
}

const SAFE_PREFIX_RE = /^[A-Za-z0-9_:]*$/

export function assertSafeKeyPrefix(prefix: string): void {
    if (!SAFE_PREFIX_RE.test(prefix)) {
        throw new Error('keyPrefix must contain only letters, numbers, underscores, and colons')
    }
}

export async function scanKeys(redis: Redis, pattern: string): Promise<string[]> {
    const keys: string[] = []
    let cursor = '0'
    do {
        const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
        cursor = nextCursor
        keys.push(...batch)
    } while (cursor !== '0')
    return keys
}

export function toRedisBuffer(bytes: Uint8Array): Buffer {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export { bytesToHex, hexToBytes, normalizeQueryLimit as safeLimit, uint8Equal }
