import type { FieldPacket, ResultSetHeader } from 'mysql2/promise'
import { bytesToHex, normalizeQueryLimit, toBytesView, uint8Equal } from 'zapo-js/util'

export type MysqlRow = Record<string, unknown>
type QueryOutput = [unknown, FieldPacket[]]

export function queryRows(output: QueryOutput): MysqlRow[] {
    return output[0] as MysqlRow[]
}

export function queryFirst(output: QueryOutput): MysqlRow | undefined {
    return (output[0] as MysqlRow[])[0]
}

export function affectedRows(output: QueryOutput): number {
    return (output[0] as ResultSetHeader).affectedRows
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
