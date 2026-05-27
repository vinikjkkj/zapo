import { toBytesView } from './bytes'
import { toSafeNumber } from './primitives'

/**
 * Coerces `value` to a safe-integer/finite number, accepting `number` and
 * `bigint` inputs. Throws with a `${field}`-suffixed message on any other type.
 */
export function asNumber(value: unknown, field: string): number {
    if (typeof value === 'number') {
        return toSafeNumber(value, field)
    }
    if (typeof value === 'bigint') {
        return toSafeNumber(Number(value), field)
    }
    throw new Error(`invalid number value for ${field}`)
}

/** Optional variant of {@link asNumber}; returns `undefined` when input is nullish. */
export function asOptionalNumber(value: unknown, field = 'optional number'): number | undefined {
    if (value === null || value === undefined) return undefined
    return asNumber(value, field)
}

/** Asserts that `value` is a string. Throws with a `${field}`-suffixed message otherwise. */
export function asString(value: unknown, field: string): string {
    if (typeof value === 'string') {
        return value
    }
    throw new Error(`invalid string value for ${field}`)
}

/** Optional variant of {@link asString}; returns `undefined` when input is nullish. */
export function asOptionalString(value: unknown, field = 'optional string'): string | undefined {
    if (value === null || value === undefined) return undefined
    return asString(value, field)
}

/**
 * Coerces `value` to a Uint8Array view, accepting `Uint8Array`, `ArrayBuffer`,
 * and any `ArrayBufferView`. Throws with a `${field}`-suffixed message otherwise.
 */
export function asBytes(value: unknown, field: string): Uint8Array {
    if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        return toBytesView(value)
    }
    throw new Error(`invalid bytes value for ${field}`)
}

/** Optional variant of {@link asBytes}; returns `undefined` when input is nullish. */
export function asOptionalBytes(value: unknown, field = 'optional bytes'): Uint8Array | undefined {
    if (value === null || value === undefined) return undefined
    return asBytes(value, field)
}

/** Returns `undefined` when `value` is nullish, otherwise `Boolean(value)`. */
export function toBoolOrUndef(value: unknown): boolean | undefined {
    return value === null || value === undefined ? undefined : Boolean(value)
}

/**
 * Returns `value` when it is a positive safe-integer, `fallback` when it is
 * undefined, and throws otherwise.
 */
export function resolvePositive(value: number | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback
    if (Number.isSafeInteger(value) && value > 0) return value
    throw new Error(`${name} must be a positive safe integer`)
}

/**
 * Lenient variants for parsing external JSON payloads (GraphQL responses,
 * Mex notifications) where fields may be missing, empty, or arrive as the
 * wrong primitive. Return null instead of throwing.
 */
export function tryAsString(value: unknown): string | null {
    return typeof value === 'string' && value.length > 0 ? value : null
}

export function tryAsNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value
    if (typeof value === 'string') {
        const normalized = value.trim()
        if (normalized.length === 0) return null
        const parsed = Number(normalized)
        return Number.isFinite(parsed) ? parsed : null
    }
    return null
}

export function tryAsRecord(value: unknown): Readonly<Record<string, unknown>> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as Readonly<Record<string, unknown>>)
        : null
}
