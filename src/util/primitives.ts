/**
 * Error handling utilities
 */

/**
 * Converts an unknown value to an Error instance
 */
export function toError(value: unknown): Error {
    if (value instanceof Error) {
        return value
    }
    if (typeof value === 'string') {
        return new Error(value)
    }
    return new Error('unknown error')
}

export function toSafeNumber(
    value: number | { toNumber?: () => number } | null | undefined,
    field: string
): number {
    if (value === null || value === undefined) {
        throw new Error(`missing ${field}`)
    }
    const numeric = typeof value === 'number' ? value : value.toNumber?.()
    if (
        typeof numeric !== 'number' ||
        !Number.isFinite(numeric) ||
        !Number.isSafeInteger(numeric)
    ) {
        throw new Error(`invalid ${field}`)
    }
    return numeric
}

export function longToNumber(value: number | { toNumber(): number } | null | undefined): number {
    if (value === null || value === undefined) {
        return 0
    }
    if (typeof value === 'number') {
        return value
    }
    return value.toNumber()
}
