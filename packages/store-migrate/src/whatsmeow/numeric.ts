import type { WhatsmeowBoolean, WhatsmeowNumeric } from './types'

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)

export function toNumber(value: WhatsmeowNumeric, field: string): number {
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`whatsmeow.${field}: non-finite number`)
        return value
    }
    if (typeof value === 'bigint') {
        if (value > MAX_SAFE) throw new Error(`whatsmeow.${field}: bigint exceeds safe integer`)
        return Number(value)
    }
    const parsed = Number.parseInt(value, 10)
    if (!Number.isFinite(parsed)) throw new Error(`whatsmeow.${field}: invalid numeric string`)
    return parsed
}

export function toBool(value: WhatsmeowBoolean): boolean {
    if (typeof value === 'boolean') return value
    if (typeof value === 'bigint') return value !== 0n
    return value !== 0
}
