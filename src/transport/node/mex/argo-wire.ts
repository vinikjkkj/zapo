import { WA_MEX_ARGO_WIRE_POOL, WA_MEX_ARGO_WIRE_TYPES } from '@transport/node/mex/argo-wire-types'

/**
 * Argo wire type for a single value.
 *
 * An argo message carries no schema of its own unless the self-describing
 * header flag is set, so the core is just a stream of labels: `1` is a boolean,
 * an array length or a string length depending on the wire type that is being
 * read. Mirrors the type model WhatsApp Android decodes from its bundled wire
 * type store.
 */
export type WaArgoWire =
    | { readonly type: 'STRING' }
    | { readonly type: 'BOOLEAN' }
    | { readonly type: 'VARINT' }
    | { readonly type: 'FLOAT64' }
    | { readonly type: 'BYTES' }
    | { readonly type: 'FIXED'; readonly length: number }
    | { readonly type: 'DESC' }
    | { readonly type: 'ERROR' }
    | { readonly type: 'PATH' }
    | { readonly type: 'EXTENSIONS' }
    | { readonly type: 'NULLABLE'; readonly of: WaArgoWire }
    | { readonly type: 'ARRAY'; readonly of: WaArgoWire }
    | { readonly type: 'RECORD'; readonly fields: readonly WaArgoWireField[] }
    | {
          readonly type: 'BLOCK'
          readonly of: WaArgoWire
          readonly key: string
          readonly dedupe: boolean
      }

export interface WaArgoWireField {
    readonly name: string
    readonly of: WaArgoWire
    readonly omittable: boolean
}

/**
 * Whether the type writes its own leading label in the core.
 *
 * Labeled types are self-delimiting, so an enclosing `NULLABLE` or omittable
 * field peeks the label instead of consuming a dedicated marker. Only `STRING`,
 * `BYTES` and `BOOLEAN` scalars are labeled, plus every `ARRAY` and `NULLABLE`.
 */
export function isLabeledArgoWire(wire: WaArgoWire): boolean {
    switch (wire.type) {
        case 'STRING':
        case 'BYTES':
        case 'BOOLEAN':
        case 'ARRAY':
        case 'NULLABLE':
            return true
        case 'BLOCK':
            return isLabeledArgoWire(wire.of)
        default:
            return false
    }
}

const SCALAR_TOKENS: Readonly<Record<string, WaArgoWire>> = Object.freeze({
    S: { type: 'STRING' },
    B: { type: 'BOOLEAN' },
    I: { type: 'VARINT' },
    F: { type: 'FLOAT64' },
    Y: { type: 'BYTES' },
    D: { type: 'DESC' },
    E: { type: 'ERROR' },
    P: { type: 'PATH' },
    X: { type: 'EXTENSIONS' }
})

interface WireCursor {
    readonly stream: string
    pos: number
}

let pool: string[] | null = null

function poolEntry(index: number): string {
    pool ??= WA_MEX_ARGO_WIRE_POOL.split('|')
    const value = pool[index]
    if (value === undefined) throw new Error(`mex argo: wire pool index ${index} is out of range`)
    return value
}

/** Reads a base 36 pool index, leaving its `;`/`?` terminator in place. */
function readPoolRef(cursor: WireCursor): string {
    const start = cursor.pos
    while (cursor.pos < cursor.stream.length) {
        const char = cursor.stream[cursor.pos]
        if (char === ';' || char === '?') break
        cursor.pos++
    }
    return poolEntry(Number.parseInt(cursor.stream.slice(start, cursor.pos), 36))
}

/** Reads a decimal count and consumes its `;` terminator. */
function readCount(cursor: WireCursor): number {
    const start = cursor.pos
    while (cursor.stream[cursor.pos] !== ';') {
        if (cursor.pos >= cursor.stream.length) throw new Error('mex argo: unterminated wire count')
        cursor.pos++
    }
    const value = Number.parseInt(cursor.stream.slice(start, cursor.pos), 10)
    cursor.pos++
    return value
}

/**
 * Expands the token stream emitted by `scripts/generate-mex-argo-wire-types.cjs`.
 *
 * Grammar: scalars are a single letter, `?x` is nullable, `*x` an array,
 * `f<len>;` a fixed blob, `b<key>;x` / `n<key>;x` a deduped / plain block, and
 * `r<count>;(<name>[;?]x)*` a record whose fields carry `;` when required and
 * `?` when omittable.
 */
function expandArgoWire(cursor: WireCursor): WaArgoWire {
    const token = cursor.stream[cursor.pos++]
    const scalar = SCALAR_TOKENS[token]
    if (scalar) return scalar
    switch (token) {
        case '?':
            return { type: 'NULLABLE', of: expandArgoWire(cursor) }
        case '*':
            return { type: 'ARRAY', of: expandArgoWire(cursor) }
        case 'f':
            return { type: 'FIXED', length: readCount(cursor) }
        case 'b':
        case 'n': {
            const key = readPoolRef(cursor)
            cursor.pos++
            return { type: 'BLOCK', of: expandArgoWire(cursor), key, dedupe: token === 'b' }
        }
        case 'r': {
            const count = readCount(cursor)
            const fields: WaArgoWireField[] = new Array(count)
            for (let i = 0; i < count; i++) {
                const name = readPoolRef(cursor)
                const omittable = cursor.stream[cursor.pos++] === '?'
                fields[i] = { name, of: expandArgoWire(cursor), omittable }
            }
            return { type: 'RECORD', fields }
        }
        default:
            throw new Error(`mex argo: unknown wire type token '${token}'`)
    }
}

const registered = new Map<string, WaArgoWire>()
const expanded = new Map<string, WaArgoWire>()

function loadBundled(opName: string): WaArgoWire | null {
    const cached = expanded.get(opName)
    if (cached) return cached
    const stream = WA_MEX_ARGO_WIRE_TYPES[opName]
    if (stream === undefined) return null
    const cursor: WireCursor = { stream, pos: 0 }
    const wire = expandArgoWire(cursor)
    if (cursor.pos !== stream.length) {
        throw new Error(`mex argo: wire stream for ${opName} has trailing tokens`)
    }
    expanded.set(opName, wire)
    return wire
}

/**
 * Teaches the argo decoder the wire type of an operation the bundled table does
 * not cover, so `format="argo"` responses for it stop failing. Takes precedence
 * over the bundled entry when both exist.
 */
export function registerMexArgoWireType(opName: string, wire: WaArgoWire): void {
    registered.set(opName, wire)
}

/** Wire type for `opName`, or `null` when neither registered nor bundled. */
export function resolveMexArgoWireType(opName: string): WaArgoWire | null {
    return registered.get(opName) ?? loadBundled(opName)
}

/** Operation names the decoder can currently handle, registered ones included. */
export function listMexArgoWireTypeNames(): string[] {
    return [...new Set([...Object.keys(WA_MEX_ARGO_WIRE_TYPES), ...registered.keys()])].sort()
}
