import type { QueryResult } from 'pg'
import { bytesToHex, normalizeQueryLimit, toBytesView, uint8Equal } from 'zapo-js/util'

export type PgRow = Record<string, unknown>

export function queryRows(result: QueryResult): PgRow[] {
    return result.rows
}

export function queryFirst(result: QueryResult): PgRow | undefined {
    return result.rows[0]
}

export function affectedRows(result: QueryResult): number {
    return result.rowCount ?? 0
}

export function toBytes(value: unknown): Uint8Array {
    if (value instanceof Uint8Array) return value
    if (value instanceof ArrayBuffer) return new Uint8Array(value)
    if (ArrayBuffer.isView(value)) return toBytesView(value)
    throw new Error('expected binary data')
}

export function toBytesOrNull(value: unknown): Uint8Array | null {
    if (value === null || value === undefined) return null
    return toBytes(value)
}

const SAFE_PREFIX_RE = /^[A-Za-z0-9_]*$/

export function assertSafeTablePrefix(prefix: string): void {
    if (!SAFE_PREFIX_RE.test(prefix)) {
        throw new Error('tablePrefix must contain only letters, numbers, and underscores')
    }
}

export { bytesToHex, normalizeQueryLimit as safeLimit, uint8Equal }
