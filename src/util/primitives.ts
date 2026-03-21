export function toError(value: unknown): Error {
    if (value instanceof Error) {
        return value
    }
    if (typeof value === 'string') {
        return new Error(value)
    }
    return new Error('unknown error')
}

function assertSafeInteger(
    value: number,
    field: string,
    nullishBehavior: 'throw' | 'zero'
): number {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
        const prefix =
            nullishBehavior === 'throw' ? `invalid ${field}` : 'invalid long numeric value'
        throw new Error(`${prefix}: ${value}`)
    }
    return value
}

export function toSafeNumber(
    value: number | { toNumber?: () => number } | null | undefined,
    field: string
): number {
    if (value === null || value === undefined) {
        throw new Error(`missing ${field}`)
    }
    const numeric = typeof value === 'number' ? value : value.toNumber?.()
    if (typeof numeric !== 'number') {
        throw new Error(`invalid ${field}`)
    }
    return assertSafeInteger(numeric, field, 'throw')
}

export function longToNumber(value: number | { toNumber(): number } | null | undefined): number {
    if (value === null || value === undefined) {
        return 0
    }
    return assertSafeInteger(typeof value === 'number' ? value : value.toNumber(), '', 'zero')
}

export function normalizeNonNegativeInteger(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fallback
    }
    return Math.max(0, Math.trunc(value))
}

export function parseStrictUnsignedInt(value: string): number | undefined {
    if (!/^\d+$/.test(value)) {
        return undefined
    }
    const parsed = Number(value)
    if (!Number.isSafeInteger(parsed)) {
        return undefined
    }
    return parsed
}

export function parseOptionalInt(value: string | undefined): number | undefined {
    if (!value) {
        return undefined
    }
    return parseStrictUnsignedInt(value)
}
