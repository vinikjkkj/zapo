#!/usr/bin/env node
'use strict'

/**
 * Regenerates `src/transport/node/mex/argo-wire-types.ts`.
 *
 * MEX argo payloads are not self-describing: the core is a bare stream of
 * labels, so `1` can be a boolean, an array length or a string length
 * depending on the operation's argo wire type. WhatsApp Android ships those
 * wire types as an argo message of its own
 * (`assets/whatsapp-android-mex_argo_wire_types.argo`), decoded here with the
 * same algorithm the app uses.
 *
 * The wire type follows the query document, and zapo issues the web documents,
 * so only the operations listed in `OPERATIONS` are emitted.
 *
 * Usage: node scripts/generate-mex-argo-wire-types.cjs <path/to/whatsapp-android-mex_argo_wire_types.argo>
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const OUTPUT = path.join(ROOT, 'src', 'transport', 'node', 'mex', 'argo-wire-types.ts')

/**
 * Emitted operations, keyed by zapo name. `android` is the store entry with the
 * same selection; `omit` drops the dotted fields the web document does not
 * select, since any field count or order mismatch breaks the positional decode.
 */
const OPERATIONS = Object.freeze({
    // Checked against a captured argo response.
    FetchReachoutTimelock: { android: 'FetchReachoutTimelockQuery' },
    // Checked against the web response type only; no argo capture yet.
    FetchNewChatMessageCappingInfo: {
        android: 'XWA2MessageCappingInfoQuery',
        omit: ['data.xwa2_message_capping_info.subscription_status']
    }
})

const SCALAR_MARKERS = Object.freeze({
    '-1': 'STRING',
    '-2': 'BOOLEAN',
    '-3': 'VARINT',
    '-4': 'FLOAT64',
    '-5': 'BYTES'
})

class Reader {
    constructor(bytes) {
        this.bytes = bytes
        this.pos = 0
        this.end = bytes.length
    }

    take(n) {
        if (this.pos + n > this.end) throw new RangeError('argo store: out of bounds')
        const view = this.bytes.subarray(this.pos, this.pos + n)
        this.pos += n
        return view
    }

    uvarint() {
        let value = 0
        let scale = 1
        let byte = 0
        do {
            if (this.pos >= this.end) throw new RangeError('argo store: out of bounds')
            byte = this.bytes[this.pos++]
            value += (byte & 0x7f) * scale
            scale *= 128
        } while (byte & 0x80)
        return value
    }

    label() {
        const zigzag = this.uvarint()
        return zigzag % 2 === 0 ? zigzag / 2 : -((zigzag + 1) / 2)
    }
}

function splitMessage(bytes) {
    const reader = new Reader(bytes)
    const header = bytes[reader.pos++]
    if (header & 0xc1) {
        throw new Error(
            `argo store: unsupported header 0x${header.toString(16)} (inline, user flags or continuation)`
        )
    }
    const segments = []
    while (reader.pos < reader.end) segments.push(reader.take(reader.label()))
    if (segments.length === 0) throw new Error('argo store: missing core segment')
    return {
        header,
        core: new Reader(segments[segments.length - 1]),
        blocks: segments.slice(0, -1)
    }
}

function createStoreReader(bytes) {
    const message = splitMessage(bytes)
    const core = message.core
    const strings = new Reader(message.blocks[0])
    const seen = []
    const decoder = new TextDecoder('utf-8', { fatal: true })

    const readString = () => {
        const label = core.label()
        if (label < -3) return seen[-label - 4]
        const value = decoder.decode(strings.take(label))
        seen.push(value)
        return value
    }
    const readBoolean = () => core.label() === 1

    const readScalar = (marker) => {
        const scalar = SCALAR_MARKERS[String(marker)]
        if (scalar) return { type: scalar }
        if (marker === -6) return { type: 'FIXED', length: core.label() }
        if (marker === -11) return { type: 'DESC' }
        throw new Error(`argo store: unexpected block scalar marker ${marker}`)
    }

    const readWire = () => {
        const marker = core.label()
        const scalar = SCALAR_MARKERS[String(marker)]
        if (scalar) return { type: scalar }
        switch (marker) {
            case -6:
                return { type: 'FIXED', length: core.label() }
            case -7: {
                const of = readScalar(core.label())
                const key = readString()
                const dedupe = readBoolean()
                return { type: 'BLOCK', of, key, dedupe }
            }
            case -8:
                return { type: 'NULLABLE', of: readWire() }
            case -9:
                return { type: 'ARRAY', of: readWire() }
            case -10: {
                const count = core.label()
                const fields = []
                for (let i = 0; i < count; i++) {
                    const name = readString()
                    const of = readWire()
                    fields.push({ name, of, omittable: readBoolean() })
                }
                return { type: 'RECORD', fields }
            }
            case -11:
                return { type: 'DESC' }
            case -12:
                return { type: 'ERROR' }
            case -13:
                return { type: 'PATH' }
            case -15:
                return { type: 'EXTENSIONS' }
            default:
                throw new Error(`argo store: unknown wire type marker ${marker}`)
        }
    }

    return { core, strings, readString, readWire }
}

function decodeStore(bytes) {
    const store = createStoreReader(bytes)
    const version = store.core.label()
    const count = store.core.label()
    const entries = new Map()
    for (let i = 0; i < count; i++) entries.set(store.readString(), store.readWire())
    if (store.core.pos !== store.core.end || store.strings.pos !== store.strings.end) {
        throw new Error(
            `argo store: trailing data (core ${store.core.pos}/${store.core.end}, ` +
                `strings ${store.strings.pos}/${store.strings.end})`
        )
    }
    return { version, entries }
}

const SCALAR_TOKENS = Object.freeze({
    STRING: 'S',
    BOOLEAN: 'B',
    VARINT: 'I',
    FLOAT64: 'F',
    BYTES: 'Y',
    DESC: 'D',
    ERROR: 'E',
    PATH: 'P',
    EXTENSIONS: 'X'
})

/** Mirror of `expandArgoWire` in `src/transport/node/mex/argo-wire.ts`. */
function encodeWire(wire, intern) {
    const scalar = SCALAR_TOKENS[wire.type]
    if (scalar) return scalar
    switch (wire.type) {
        case 'FIXED':
            return `f${wire.length};`
        case 'NULLABLE':
            return `?${encodeWire(wire.of, intern)}`
        case 'ARRAY':
            return `*${encodeWire(wire.of, intern)}`
        case 'BLOCK':
            return `${wire.dedupe ? 'b' : 'n'}${intern(wire.key)};${encodeWire(wire.of, intern)}`
        case 'RECORD': {
            const fields = wire.fields
                .map(
                    (field) =>
                        `${intern(field.name)}${field.omittable ? '?' : ';'}${encodeWire(field.of, intern)}`
                )
                .join('')
            return `r${wire.fields.length};${fields}`
        }
        default:
            throw new Error(`cannot encode wire type ${wire.type}`)
    }
}

function omitField(wire, dotted) {
    const [head, ...rest] = dotted.split('.')
    switch (wire.type) {
        case 'NULLABLE':
        case 'ARRAY':
            return { ...wire, of: omitField(wire.of, dotted) }
        case 'RECORD': {
            const at = wire.fields.findIndex((field) => field.name === head)
            if (at < 0) throw new Error(`omit: no field ${head}`)
            const fields =
                rest.length === 0
                    ? wire.fields.filter((_, i) => i !== at)
                    : wire.fields.map((field, i) =>
                          i === at ? { ...field, of: omitField(field.of, rest.join('.')) } : field
                      )
            return { ...wire, fields }
        }
        default:
            throw new Error(`omit: cannot reach ${head} through ${wire.type}`)
    }
}

function main() {
    const asset = process.argv[2]
    if (!asset || !fs.existsSync(asset)) {
        console.error(
            'usage: node scripts/generate-mex-argo-wire-types.cjs <path/to/whatsapp-android-mex_argo_wire_types.argo>'
        )
        process.exit(1)
    }

    const { version, entries } = decodeStore(new Uint8Array(fs.readFileSync(asset)))
    const { WA_MEX_PERSIST_IDS } = require(path.join(ROOT, 'spec', 'mex', 'index.js'))

    const matched = []
    for (const opName of Object.keys(OPERATIONS).sort()) {
        const { android, omit = [] } = OPERATIONS[opName]
        if (!(opName in WA_MEX_PERSIST_IDS)) throw new Error(`${opName} is not a zapo operation`)
        const stored = entries.get(android)
        if (stored == null) throw new Error(`${android} is not in the store`)
        const wire = omit.reduce(omitField, stored)
        const source = omit.length === 0 ? android : `${android} without ${omit.join(', ')}`
        matched.push([opName, source, wire])
    }

    const pool = []
    const poolIndex = new Map()
    const intern = (value) => {
        let at = poolIndex.get(value)
        if (at === undefined) {
            at = pool.length
            pool.push(value)
            poolIndex.set(value, at)
        }
        return at.toString(36)
    }

    const encoded = matched.map(([opName, source, wire]) => [
        opName,
        source,
        encodeWire(wire, intern)
    ])

    const listing = matched
        .map(([opName, source]) => `// - ${opName} (android: ${source})`)
        .join('\n')
    const table = encoded.map(([opName, , stream]) => `    ${opName}: '${stream}'`).join(',\n')

    const file = `// Generated by scripts/generate-mex-argo-wire-types.cjs - do not edit by hand.
//
// Argo wire types for the MEX operations that answer with \`format="argo"\`.
// Derived from the WhatsApp Android wire type store (version ${version}), narrowed to
// the operations listed in the generator and re-keyed by zapo operation name.
//
// Covered operations:
${listing}
//
// Encoded as a token stream to keep the resident cost at a few KB; see
// \`expandArgoWire\` in \`argo-wire.ts\` for the grammar. Names and block keys are
// indexes (base 36) into the shared pool below.

/** Field names and block keys shared by every encoded wire type, \`|\` separated. */
export const WA_MEX_ARGO_WIRE_POOL = '${pool.join('|')}'

/** Encoded wire type per zapo operation name, expanded lazily on first use. */
export const WA_MEX_ARGO_WIRE_TYPES: Readonly<Record<string, string>> = Object.freeze({
${table}
})
`

    fs.writeFileSync(OUTPUT, file)
    console.log(
        `wrote ${path.relative(ROOT, OUTPUT)}: ${matched.length} operations ` +
            `(store has ${entries.size} entries), ${fs.statSync(OUTPUT).size} bytes`
    )
}

main()
