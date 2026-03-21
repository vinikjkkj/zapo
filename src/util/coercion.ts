import { toBytesView } from './bytes'
import { toSafeNumber } from './primitives'

export function asNumber(value: unknown, field: string): number {
    if (typeof value === 'bigint') {
        return toSafeNumber(Number(value), field)
    }
    if (typeof value === 'number') {
        return toSafeNumber(value, field)
    }
    throw new Error(`invalid number value for ${field}`)
}

export function asOptionalNumber(value: unknown, field = 'optional number'): number | undefined {
    if (value === null || value === undefined) return undefined
    return asNumber(value, field)
}

export function asString(value: unknown, field: string): string {
    if (typeof value === 'string') {
        return value
    }
    throw new Error(`invalid string value for ${field}`)
}

export function asOptionalString(value: unknown, field = 'optional string'): string | undefined {
    if (value === null || value === undefined) return undefined
    return asString(value, field)
}

export function asBytes(value: unknown, field: string): Uint8Array {
    if (value instanceof Uint8Array || value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        return toBytesView(value)
    }
    throw new Error(`invalid bytes value for ${field}`)
}

export function asOptionalBytes(value: unknown, field = 'optional bytes'): Uint8Array | undefined {
    if (value === null || value === undefined) return undefined
    return asBytes(value, field)
}

export function toBoolOrUndef(value: unknown): boolean | undefined {
    return value === null || value === undefined ? undefined : Boolean(value)
}

export function resolvePositive(value: number | undefined, fallback: number, name: string): number {
    if (value === undefined) return fallback
    if (Number.isSafeInteger(value) && value > 0) return value
    throw new Error(`${name} must be a positive safe integer`)
}
