import { TEXT_DECODER } from '@util/bytes'

export interface WaMexArgoError {
    readonly message: string
    readonly path: number | null
    readonly extensions: Record<string, unknown> | null
}

export interface WaMexArgoResponse {
    readonly data: unknown
    readonly errors: WaMexArgoError[]
}

interface ReaderLike {
    readonly arr: Uint8Array
    pos: number
    readonly end: number
    label(): number
    bytes(n: number): Uint8Array
    bitset(): number
}

interface ArgoModule {
    readonly Reader: new (arr: Uint8Array) => ReaderLike
}

let cachedArgo: ArgoModule | null | undefined

async function loadArgo(): Promise<ArgoModule | null> {
    if (cachedArgo !== undefined) return cachedArgo
    try {
        cachedArgo = (await import('argo-codec')) as unknown as ArgoModule
    } catch {
        cachedArgo = null
    }
    return cachedArgo
}

export async function isMexArgoDecoderAvailable(): Promise<boolean> {
    return (await loadArgo()) !== null
}

const LABEL_NULL = -1
const LABEL_ABSENT = -2
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

const FLAG_INLINE_EVERYTHING = 1 << 0
const FLAG_HAS_USER_FLAGS = 1 << 6

export async function decodeMexArgoResponse(bytes: Uint8Array): Promise<WaMexArgoResponse> {
    const argo = await loadArgo()
    if (!argo) throw new Error('argo-codec not installed')

    const r = new argo.Reader(bytes)
    const flags = r.bitset()
    const inline = (flags & FLAG_INLINE_EVERYTHING) !== 0
    if (flags & FLAG_HAS_USER_FLAGS) r.bitset()

    const segments: ReaderLike[] = []
    if (!inline) {
        while (r.pos < r.end) {
            const len = r.label()
            segments.push(new argo.Reader(r.bytes(len)))
        }
        if (segments.length === 0) throw new Error('mex argo: missing core segment')
    } else {
        segments.push(r)
    }

    const core = segments[segments.length - 1]
    const blocks = inline ? new Map<string, ReaderLike>() : indexBlocks(segments.slice(0, -1))
    const ctx: DecodeCtx = { core, blocks, stringSeen: [] }

    const data = readDesc(ctx)
    const errors: WaMexArgoError[] = []
    if (core.pos < core.end) {
        const errCount = core.label()
        for (let i = 0; i < errCount; i++) errors.push(readError(ctx))
    }
    return { data, errors }
}

interface DecodeCtx {
    readonly core: ReaderLike
    readonly blocks: Map<string, ReaderLike>
    readonly stringSeen: string[]
}

function indexBlocks(slices: ReaderLike[]): Map<string, ReaderLike> {
    const m = new Map<string, ReaderLike>()
    const keys = ['String', 'Int', 'Float', 'Bytes']
    for (let i = 0; i < slices.length && i < keys.length; i++) m.set(keys[i], slices[i])
    return m
}

function getBlock(ctx: DecodeCtx, key: string): ReaderLike {
    const b = ctx.blocks.get(key)
    if (!b) throw new Error(`mex argo: block '${key}' missing`)
    return b
}

function readStringFromBlock(ctx: DecodeCtx): string {
    const lab = ctx.core.label()
    if (lab < BACKREF_BASE + 1) {
        const idx = -lab + BACKREF_BASE
        return ctx.stringSeen[idx]
    }
    const block = getBlock(ctx, 'String')
    const s = TEXT_DECODER.decode(block.bytes(lab))
    ctx.stringSeen.push(s)
    return s
}

function readDesc(ctx: DecodeCtx): unknown {
    const m = ctx.core.label()
    switch (m) {
        case DESC_NULL:
            return null
        case DESC_FALSE:
            return false
        case DESC_TRUE:
            return true
        case DESC_STRING:
            return readStringFromBlock(ctx)
        case DESC_INT:
            return getBlock(ctx, 'Int').label()
        case DESC_FLOAT:
            throw new Error('mex argo: DESC_FLOAT not implemented')
        case DESC_BYTES:
            throw new Error('mex argo: DESC_BYTES not implemented')
        case DESC_LIST: {
            const n = ctx.core.label()
            const out: unknown[] = []
            for (let i = 0; i < n; i++) out.push(readDesc(ctx))
            return out
        }
        case DESC_OBJECT: {
            const n = ctx.core.label()
            const out: Record<string, unknown> = {}
            for (let i = 0; i < n; i++) {
                const key = readStringFromBlock(ctx)
                out[key] = readDesc(ctx)
            }
            return out
        }
        default:
            throw new Error(`mex argo: unknown DESC marker ${m}`)
    }
}

function readError(ctx: DecodeCtx): WaMexArgoError {
    const message = readStringFromBlock(ctx)
    skipOptional(ctx) // location — never observed in MEX errors so far
    const path = readPath(ctx)
    const extensions = readOptionalDesc(ctx)
    return { message, path, extensions }
}

function skipOptional(ctx: DecodeCtx): void {
    const lab = ctx.core.label()
    if (lab !== LABEL_ABSENT && lab !== LABEL_NULL) {
        // Present but not yet structurally decoded; would need a typed inner read here.
        // For locations specifically we have no observed sample; bail loudly if hit.
        throw new Error(`mex argo: unexpected optional present (lab=${lab}); add support`)
    }
}

function readPath(ctx: DecodeCtx): number | null {
    const lab = ctx.core.label()
    if (lab === LABEL_ABSENT || lab === LABEL_NULL) return null
    return lab
}

function readOptionalDesc(ctx: DecodeCtx): Record<string, unknown> | null {
    const lab = ctx.core.label()
    if (lab === LABEL_ABSENT || lab === LABEL_NULL) return null
    const v = readDesc(ctx)
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null
}
