import { base64ToBytes } from 'zapo-js/util'

/** Reviver for Baileys' `BufferJSON` shape (`{ type: 'Buffer', data: '<base64>' }`). */
export function bufferJsonReviver(_: string, value: unknown): unknown {
    if (
        typeof value === 'object' &&
        value !== null &&
        (value as { type?: unknown }).type === 'Buffer' &&
        typeof (value as { data?: unknown }).data === 'string'
    ) {
        return base64ToBytes((value as { data: string }).data)
    }
    return value
}
