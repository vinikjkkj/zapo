/**
 * JSON-friendly serializer with markers for non-JSON types.
 *
 * Markers used:
 *   { "$bytes": "<base64>" }       - Uint8Array
 *   { "$bigint": "<digits>" }      - BigInt
 *   { "$date": "<iso>" }           - Date
 *   { "$set": [...] }              - Set
 *   { "$map": [[k, v], ...] }      - Map
 *   { "$error": { name, message, stack?, code? } }
 *   { "$function": "<name>" }      - Function (encoded only)
 *   "[Circular]"                   - Cycle marker
 */

import { base64ToBytes, bytesToBase64 } from 'zapo-js/util'

const BYTES = '$bytes'
const BIGINT = '$bigint'
const DATE = '$date'
const SET = '$set'
const MAP = '$map'
const ERROR_KEY = '$error'
const FUNCTION_KEY = '$function'

const MAX_DEPTH = 32

export const encodeForJson = (value: unknown): unknown => {
    return encode(value, new WeakSet(), 0)
}

export const decodeFromJson = (value: unknown): unknown => {
    return decode(value, 0)
}

const encode = (value: unknown, seen: WeakSet<object>, depth: number): unknown => {
    if (depth > MAX_DEPTH) {
        return '[MaxDepthReached]'
    }
    if (value === null || value === undefined) {
        return value ?? null
    }
    const type = typeof value
    if (type === 'string' || type === 'number' || type === 'boolean') {
        return value
    }
    if (type === 'bigint') {
        return { [BIGINT]: (value as bigint).toString() }
    }
    if (type === 'function') {
        return { [FUNCTION_KEY]: (value as { name?: string }).name ?? '' }
    }
    if (type !== 'object') {
        return String(value)
    }
    const obj = value
    if (seen.has(obj)) {
        return '[Circular]'
    }
    seen.add(obj)
    try {
        if (obj instanceof Uint8Array) {
            return { [BYTES]: bytesToBase64(obj) }
        }
        if (obj instanceof Date) {
            return { [DATE]: obj.toISOString() }
        }
        if (obj instanceof Error) {
            const err = obj as Error & { code?: unknown }
            return {
                [ERROR_KEY]: {
                    name: err.name,
                    message: err.message,
                    stack: err.stack,
                    code:
                        typeof err.code === 'string' || typeof err.code === 'number'
                            ? err.code
                            : undefined
                }
            }
        }
        if (obj instanceof Map) {
            const entries: unknown[] = []
            for (const [k, v] of obj.entries()) {
                entries.push([encode(k, seen, depth + 1), encode(v, seen, depth + 1)])
            }
            return { [MAP]: entries }
        }
        if (obj instanceof Set) {
            const entries: unknown[] = []
            for (const v of obj.values()) {
                entries.push(encode(v, seen, depth + 1))
            }
            return { [SET]: entries }
        }
        if (Array.isArray(obj)) {
            const out: unknown[] = new Array(obj.length)
            for (let i = 0; i < obj.length; i += 1) {
                out[i] = encode(obj[i], seen, depth + 1)
            }
            return out
        }
        const out: Record<string, unknown> = {}
        for (const key of Object.keys(obj)) {
            out[key] = encode((obj as Record<string, unknown>)[key], seen, depth + 1)
        }
        return out
    } finally {
        seen.delete(obj)
    }
}

const decode = (value: unknown, depth: number): unknown => {
    if (depth > MAX_DEPTH) {
        return value
    }
    if (value === null || value === undefined) {
        return value
    }
    if (typeof value !== 'object') {
        return value
    }
    if (Array.isArray(value)) {
        const out: unknown[] = new Array(value.length)
        for (let i = 0; i < value.length; i += 1) {
            out[i] = decode(value[i], depth + 1)
        }
        return out
    }
    const obj = value as Record<string, unknown>
    if (BYTES in obj && typeof obj[BYTES] === 'string') {
        return base64ToBytes(obj[BYTES])
    }
    if (BIGINT in obj && typeof obj[BIGINT] === 'string') {
        return BigInt(obj[BIGINT])
    }
    if (DATE in obj && typeof obj[DATE] === 'string') {
        return new Date(obj[DATE])
    }
    if (SET in obj && Array.isArray(obj[SET])) {
        const arr = obj[SET] as unknown[]
        const set = new Set<unknown>()
        for (let i = 0; i < arr.length; i += 1) {
            set.add(decode(arr[i], depth + 1))
        }
        return set
    }
    if (MAP in obj && Array.isArray(obj[MAP])) {
        const arr = obj[MAP] as unknown[]
        const map = new Map<unknown, unknown>()
        for (let i = 0; i < arr.length; i += 1) {
            const entry = arr[i] as [unknown, unknown]
            map.set(decode(entry[0], depth + 1), decode(entry[1], depth + 1))
        }
        return map
    }
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(obj)) {
        out[key] = decode(obj[key], depth + 1)
    }
    return out
}
