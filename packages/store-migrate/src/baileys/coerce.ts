import { asBytes, base64ToBytes } from 'zapo-js/util'

import type { MaybeBytes } from './types'

/** Decode base64 strings (Baileys session) and pass through Uint8Array (everything else). */
export function toBytes(value: MaybeBytes, field: string): Uint8Array {
    if (typeof value === 'string') return base64ToBytes(value)
    return asBytes(value, `baileys.${field}`)
}

export function toOptionalBytes(
    value: MaybeBytes | null | undefined,
    field: string
): Uint8Array | undefined {
    if (value === null || value === undefined) return undefined
    return toBytes(value, field)
}
