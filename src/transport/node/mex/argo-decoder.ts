import { isLabeledArgoWire, type WaArgoWire } from '@transport/node/mex/argo-wire'
import { TEXT_DECODER } from '@util/bytes'

export interface WaMexArgoErrorLocation {
    readonly line: number
    readonly column: number
}

export interface WaMexArgoError {
    readonly message: string
    readonly locations: readonly WaMexArgoErrorLocation[] | null
    /** Response path, resolved to field names where the wire type allows it. */
    readonly path: readonly (string | number)[] | null
    readonly extensions: Record<string, unknown> | null
}

export interface WaMexArgoResponse {
    readonly data: unknown
    readonly errors: readonly WaMexArgoError[]
}

/**
 * Header flags, read from the single header byte.
 *
 * WhatsApp writes the seven flags in bits 0..6 of one byte and reserves bit 7
 * as a continuation marker it refuses to parse. This is not the bit-1..7
 * BitSet layout generic argo readers use, so a stock reader mistakes the
 * common `0x04` (out-of-band field errors) for self-describing.
 */
interface ArgoHeader {
    readonly inlineEverything: boolean
    readonly selfDescribing: boolean
    readonly outOfBandFieldErrors: boolean
    readonly selfDescribingErrors: boolean
    readonly nullTerminatedStrings: boolean
    readonly noDeduplication: boolean
}

const FLAG_INLINE_EVERYTHING = 0x01
const FLAG_SELF_DESCRIBING = 0x02
const FLAG_OUT_OF_BAND_FIELD_ERRORS = 0x04
const FLAG_SELF_DESCRIBING_ERRORS = 0x08
const FLAG_NULL_TERMINATED_STRINGS = 0x10
const FLAG_NO_DEDUPLICATION = 0x20
const FLAG_HAS_USER_FLAGS = 0x40
const FLAG_HEADER_CONTINUATION = 0x80

const LABEL_NULL = -1
const LABEL_ABSENT = -2
const LABEL_ERROR = -3
const LABEL_NON_NULL = 0
const BACKREF_BASE = -4

const DESC_NULL = -1
const DESC_FALSE = 0
const DESC_TRUE = 1
const DESC_OBJECT = 2
const DESC_LIST = 3
const DESC_STRING = 4
const DESC_BYTES = 5
const DESC_INT = 6
const DESC_FLOAT = 7

const BLOCK_STRING = 'String'
const BLOCK_BYTES = 'Bytes'
const BLOCK_INT = 'Int'
const BLOCK_FLOAT = 'Float'

class ArgoReader {
    readonly bytes: Uint8Array
    readonly end: number
    pos = 0

    private view: DataView | null = null

    constructor(bytes: Uint8Array) {
        this.bytes = bytes
        this.end = bytes.length
    }

    byte(): number {
        if (this.pos >= this.end) throw new Error('mex argo: reader out of bounds')
        return this.bytes[this.pos++]
    }

    take(length: number): Uint8Array {
        if (length < 0 || this.pos + length > this.end) {
            throw new Error('mex argo: reader out of bounds')
        }
        const view = this.bytes.subarray(this.pos, this.pos + length)
        this.pos += length
        return view
    }

    uvarint(): number {
        let value = 0
        let scale = 1
        let byte = 0
        do {
            if (this.pos >= this.end) throw new Error('mex argo: reader out of bounds')
            byte = this.bytes[this.pos++]
            value += (byte & 0x7f) * scale
            scale *= 128
        } while (byte & 0x80)
        return value
    }

    /** Signed zig-zag label. */
    label(): number {
        const zigzag = this.uvarint()
        return zigzag % 2 === 0 ? zigzag / 2 : -((zigzag + 1) / 2)
    }

    /** Reads a label without consuming it. */
    peekLabel(): number {
        const start = this.pos
        const value = this.label()
        this.pos = start
        return value
    }

    float64(): number {
        if (this.pos + 8 > this.end) throw new Error('mex argo: reader out of bounds')
        this.view ??= new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength)
        const value = this.view.getFloat64(this.pos, true)
        this.pos += 8
        return value
    }
}

interface ArgoBlock {
    readonly reader: ArgoReader
    readonly dedupe: boolean
    readonly seen: (string | Uint8Array)[]
}

interface ArgoContext {
    readonly header: ArgoHeader
    readonly core: ArgoReader
    readonly slices: readonly Uint8Array[]
    readonly blocks: Map<string, ArgoBlock>
    readonly errors: WaMexArgoError[]
    nextSlice: number
    pathRoot: WaArgoWire | null
}

function readHeader(reader: ArgoReader): ArgoHeader {
    const flags = reader.byte()
    if (flags & FLAG_HEADER_CONTINUATION) {
        throw new Error('mex argo: header continuation is not supported')
    }
    if (flags & FLAG_HAS_USER_FLAGS) {
        // User flags are a bit set whose least significant bit is the
        // continuation flag. Nothing consumes them, so drain and drop.
        let more = true
        while (more) more = (reader.byte() & 1) === 1
    }
    return {
        inlineEverything: (flags & FLAG_INLINE_EVERYTHING) !== 0,
        selfDescribing: (flags & FLAG_SELF_DESCRIBING) !== 0,
        outOfBandFieldErrors: (flags & FLAG_OUT_OF_BAND_FIELD_ERRORS) !== 0,
        selfDescribingErrors: (flags & FLAG_SELF_DESCRIBING_ERRORS) !== 0,
        nullTerminatedStrings: (flags & FLAG_NULL_TERMINATED_STRINGS) !== 0,
        noDeduplication: (flags & FLAG_NO_DEDUPLICATION) !== 0
    }
}

function createContext(bytes: Uint8Array): ArgoContext {
    const reader = new ArgoReader(bytes)
    const header = readHeader(reader)

    let core: ArgoReader
    let slices: Uint8Array[] = []
    if (header.inlineEverything) {
        core = reader
    } else {
        const segments: Uint8Array[] = []
        while (reader.pos < reader.end) segments.push(reader.take(reader.label()))
        if (segments.length === 0) throw new Error('mex argo: missing core segment')
        core = new ArgoReader(segments[segments.length - 1])
        slices = segments.slice(0, -1)
    }

    return { header, core, slices, blocks: new Map(), errors: [], nextSlice: 0, pathRoot: null }
}

/**
 * Blocks are claimed in first-use order, keyed by the wire type's block key
 * (`String`, `Int`, but also per-enum keys such as `XWA2ReachoutTimelockType`).
 * Boolean blocks and every block in inline mode read straight from the core.
 */
function useBlock(ctx: ArgoContext, key: string, dedupe: boolean, inCore: boolean): ArgoBlock {
    const existing = ctx.blocks.get(key)
    if (existing) return existing

    let reader: ArgoReader
    if (inCore || ctx.header.inlineEverything) {
        reader = ctx.core
    } else {
        if (ctx.nextSlice >= ctx.slices.length) {
            throw new Error(`mex argo: block '${key}' has no payload slice left`)
        }
        reader = new ArgoReader(ctx.slices[ctx.nextSlice++])
    }

    const block: ArgoBlock = {
        reader,
        dedupe: dedupe && !ctx.header.noDeduplication,
        seen: []
    }
    ctx.blocks.set(key, block)
    return block
}

function readBlockBytes(ctx: ArgoContext, block: ArgoBlock): Uint8Array {
    const label = ctx.core.label()
    if (block.dedupe && label < BACKREF_BASE + 1) {
        const previous = block.seen[-label + BACKREF_BASE]
        if (previous === undefined) throw new Error(`mex argo: unknown backreference ${label}`)
        if (typeof previous === 'string') throw new Error('mex argo: backreference type mismatch')
        return previous
    }
    const value = block.reader.take(label)
    if (block.dedupe) block.seen.push(value)
    return value
}

function readBlockString(ctx: ArgoContext, block: ArgoBlock): string {
    const label = ctx.core.label()
    if (block.dedupe && label < BACKREF_BASE + 1) {
        const previous = block.seen[-label + BACKREF_BASE]
        if (previous === undefined) throw new Error(`mex argo: unknown backreference ${label}`)
        if (typeof previous !== 'string') throw new Error('mex argo: backreference type mismatch')
        return previous
    }
    const value = TEXT_DECODER.decode(block.reader.take(label))
    if (ctx.header.nullTerminatedStrings && block.reader.byte() !== 0) {
        throw new Error('mex argo: missing string terminator')
    }
    if (block.dedupe) block.seen.push(value)
    return value
}

/** Self-describing value, used for `DESC`/`EXTENSIONS` and in self-describing messages. */
function readDesc(ctx: ArgoContext): unknown {
    const marker = ctx.core.label()
    switch (marker) {
        case DESC_NULL:
            return null
        case DESC_FALSE:
            return false
        case DESC_TRUE:
            return true
        case DESC_STRING:
            return readBlockString(ctx, useBlock(ctx, BLOCK_STRING, true, false))
        case DESC_BYTES:
            return readBlockBytes(ctx, useBlock(ctx, BLOCK_BYTES, true, false))
        case DESC_INT:
            return useBlock(ctx, BLOCK_INT, false, false).reader.label()
        case DESC_FLOAT:
            return useBlock(ctx, BLOCK_FLOAT, false, false).reader.float64()
        case DESC_LIST: {
            const length = ctx.core.label()
            const items: unknown[] = []
            for (let i = 0; i < length; i++) items.push(readDesc(ctx))
            return items
        }
        case DESC_OBJECT: {
            const length = ctx.core.label()
            const block = useBlock(ctx, BLOCK_STRING, true, false)
            const object: Record<string, unknown> = {}
            for (let i = 0; i < length; i++) object[readBlockString(ctx, block)] = readDesc(ctx)
            return object
        }
        default:
            throw new Error(`mex argo: unknown self-describing marker ${marker}`)
    }
}

function readDescObject(ctx: ArgoContext): Record<string, unknown> {
    const marker = ctx.core.peekLabel()
    if (marker !== DESC_OBJECT) {
        throw new Error(`mex argo: expected a self-describing object, got marker ${marker}`)
    }
    return readDesc(ctx) as Record<string, unknown>
}

const PRESENT = 0
const ABSENT = 1
const FIELD_ERROR = 2

/** Reads the `-2`/present marker of an omittable field. */
function readOmittable(ctx: ArgoContext, labeled: boolean): number {
    if (labeled) {
        if (ctx.core.peekLabel() !== LABEL_ABSENT) return PRESENT
        ctx.core.label()
        return ABSENT
    }
    const label = ctx.core.label()
    if (label === LABEL_ABSENT) return ABSENT
    if (label === LABEL_NON_NULL) return PRESENT
    throw new Error(`mex argo: unexpected omittable marker ${label}`)
}

/** Reads the `-1`/`-3`/present marker of a nullable value. */
function readNullable(ctx: ArgoContext, labeled: boolean): number {
    if (labeled) {
        const peeked = ctx.core.peekLabel()
        if (peeked !== LABEL_NULL && peeked !== LABEL_ERROR) return PRESENT
        ctx.core.label()
        return peeked === LABEL_NULL ? ABSENT : FIELD_ERROR
    }
    const label = ctx.core.label()
    if (label === LABEL_NULL) return ABSENT
    if (label === LABEL_ERROR) return FIELD_ERROR
    if (label === LABEL_NON_NULL) return PRESENT
    throw new Error(`mex argo: unexpected nullable marker ${label}`)
}

function readValue(ctx: ArgoContext, wire: WaArgoWire, block: ArgoBlock | null): unknown {
    switch (wire.type) {
        case 'BLOCK': {
            const inCore = wire.of.type === 'BOOLEAN'
            return readValue(ctx, wire.of, useBlock(ctx, wire.key, wire.dedupe, inCore))
        }
        case 'STRING':
            return readBlockString(ctx, block ?? useBlock(ctx, BLOCK_STRING, true, false))
        case 'BYTES':
            return readBlockBytes(ctx, block ?? useBlock(ctx, BLOCK_BYTES, true, false))
        case 'BOOLEAN': {
            const label = ctx.core.label()
            if (label !== 0 && label !== 1)
                throw new Error(`mex argo: invalid boolean label ${label}`)
            return label === 1
        }
        case 'VARINT':
            return (block?.reader ?? ctx.core).label()
        case 'FLOAT64':
            return (block?.reader ?? ctx.core).float64()
        case 'FIXED':
            return (block?.reader ?? ctx.core).take(wire.length)
        case 'DESC':
            return readDesc(ctx)
        case 'EXTENSIONS':
            return readDescObject(ctx)
        case 'ERROR':
            return readError(ctx)
        case 'PATH':
            return readPath(ctx)
        case 'NULLABLE': {
            const marker = readNullable(ctx, isLabeledArgoWire(wire.of))
            if (marker === ABSENT) return null
            if (marker === FIELD_ERROR) {
                // Out of band errors are reported once through the response's
                // own `errors` field, so nothing trails the marker.
                if (!ctx.header.outOfBandFieldErrors) {
                    const count = ctx.core.label()
                    for (let i = 0; i < count; i++) ctx.errors.push(readError(ctx))
                }
                return null
            }
            return readValue(ctx, wire.of, block)
        }
        case 'ARRAY': {
            const length = ctx.core.label()
            const items: unknown[] = new Array(length)
            for (let i = 0; i < length; i++) items[i] = readValue(ctx, wire.of, block)
            return items
        }
        case 'RECORD': {
            const record: Record<string, unknown> = {}
            for (const field of wire.fields) {
                if (field.omittable && readOmittable(ctx, isLabeledArgoWire(field.of)) === ABSENT) {
                    continue
                }
                record[field.name] = readValue(ctx, field.of, block)
            }
            return record
        }
    }
}

function readPath(ctx: ArgoContext): (string | number)[] {
    const length = ctx.core.label()
    const indexes: number[] = new Array(length)
    const block = useBlock(ctx, BLOCK_INT, false, false)
    for (let i = 0; i < length; i++) indexes[i] = block.reader.label()
    return resolvePath(indexes, ctx.pathRoot)
}

/**
 * Turns the numeric response path into field names by walking the wire type,
 * as WhatsApp Android does. Indexes that outrun the wire type stay numeric.
 */
function resolvePath(indexes: readonly number[], root: WaArgoWire | null): (string | number)[] {
    const path: (string | number)[] = []
    let wire = root
    for (const index of indexes) {
        while (wire !== null && (wire.type === 'NULLABLE' || wire.type === 'BLOCK')) wire = wire.of
        if (wire?.type === 'ARRAY') {
            path.push(index)
            wire = wire.of
            continue
        }
        const field = wire?.type === 'RECORD' ? wire.fields[index] : undefined
        if (!field) {
            path.push(index)
            wire = null
            continue
        }
        path.push(field.name)
        wire = field.of
    }
    return path
}

function readError(ctx: ArgoContext): WaMexArgoError {
    if (ctx.header.selfDescribing || ctx.header.selfDescribingErrors) {
        return toArgoError(readDescObject(ctx))
    }

    const message = readBlockString(ctx, useBlock(ctx, BLOCK_STRING, true, false))

    let locations: WaMexArgoErrorLocation[] | null = null
    if (readOmittable(ctx, true) === PRESENT) {
        const count = ctx.core.label()
        const block = useBlock(ctx, BLOCK_INT, false, false)
        locations = new Array(count)
        for (let i = 0; i < count; i++) {
            locations[i] = { line: block.reader.label(), column: block.reader.label() }
        }
    }

    // `path` is a PATH, whose leading length doubles as its label, so the
    // omittable marker is read as if the type were labeled.
    const path = readOmittable(ctx, true) === PRESENT ? readPath(ctx) : null
    const extensions = readOmittable(ctx, false) === PRESENT ? readDescObject(ctx) : null

    return { message, locations, path, extensions }
}

function toArgoError(value: Record<string, unknown>): WaMexArgoError {
    const locations = Array.isArray(value.locations)
        ? (value.locations as Record<string, unknown>[]).map((entry) => ({
              line: Number(entry.line),
              column: Number(entry.column)
          }))
        : null
    return {
        message: typeof value.message === 'string' ? value.message : '',
        locations,
        path: Array.isArray(value.path) ? (value.path as (string | number)[]) : null,
        extensions:
            typeof value.extensions === 'object' && value.extensions !== null
                ? (value.extensions as Record<string, unknown>)
                : null
    }
}

function dataFieldWire(wire: WaArgoWire): WaArgoWire | null {
    if (wire.type !== 'RECORD') return null
    return wire.fields.find((field) => field.name === 'data')?.of ?? null
}

function assertFullyConsumed(ctx: ArgoContext): void {
    if (ctx.core.pos !== ctx.core.end) {
        throw new Error(`mex argo: ${ctx.core.end - ctx.core.pos} trailing byte(s) in the core`)
    }
    for (const [key, block] of ctx.blocks) {
        if (block.reader === ctx.core) continue
        if (block.reader.pos !== block.reader.end) {
            const left = block.reader.end - block.reader.pos
            throw new Error(`mex argo: ${left} trailing byte(s) in block '${key}'`)
        }
    }
    if (ctx.nextSlice !== ctx.slices.length) {
        throw new Error(`mex argo: ${ctx.slices.length - ctx.nextSlice} unread block(s)`)
    }
}

/**
 * Decodes a `format="argo"` MEX result.
 *
 * `wire` is the operation's argo wire type - the payload carries no schema
 * unless the self-describing header flag is set, in which case it is ignored.
 * Every byte of the core and of each claimed block must be consumed, which is
 * what turns a wire type that does not match the response into a hard error
 * instead of a silently wrong value tree.
 */
export function decodeMexArgoResponse(bytes: Uint8Array, wire: WaArgoWire): WaMexArgoResponse {
    const ctx = createContext(bytes)
    ctx.pathRoot = dataFieldWire(wire)

    const decoded = ctx.header.selfDescribing ? readDesc(ctx) : readValue(ctx, wire, null)
    assertFullyConsumed(ctx)

    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) {
        return { data: decoded, errors: ctx.errors }
    }

    const root = decoded as Record<string, unknown>
    const errors = Array.isArray(root.errors)
        ? [...ctx.errors, ...(root.errors as WaMexArgoError[])]
        : ctx.errors
    return { data: 'data' in root ? root.data : root, errors }
}
