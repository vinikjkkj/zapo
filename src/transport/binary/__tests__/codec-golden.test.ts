import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import { decodeBinaryNode, encodeBinaryNode } from '@transport/binary'
import type { BinaryNode } from '@transport/types'
import { bytesToHex, hexToBytes } from '@util/bytes'

interface GoldenNodeSpec {
    readonly tag: string
    readonly attrs: Record<string, string>
    readonly content?: string | GoldenNodeSpec[] | { readonly $bytes: string }
}

interface GoldenFixture {
    readonly name: string
    readonly node: GoldenNodeSpec
    readonly hex: string
}

const fixtures = JSON.parse(
    readFileSync(join(__dirname, 'codec-golden.json'), 'utf8')
) as GoldenFixture[]

function toNode(spec: GoldenNodeSpec): BinaryNode {
    if (spec.content === undefined) {
        return { tag: spec.tag, attrs: spec.attrs }
    }
    if (typeof spec.content === 'string') {
        return { tag: spec.tag, attrs: spec.attrs, content: spec.content }
    }
    if (Array.isArray(spec.content)) {
        return { tag: spec.tag, attrs: spec.attrs, content: spec.content.map(toNode) }
    }
    return { tag: spec.tag, attrs: spec.attrs, content: hexToBytes(spec.content.$bytes) }
}

test('binary encoder matches golden fixtures byte for byte', () => {
    assert.ok(fixtures.length >= 16)
    for (const fixture of fixtures) {
        const encoded = encodeBinaryNode(toNode(fixture.node))
        assert.equal(bytesToHex(encoded), fixture.hex, `fixture: ${fixture.name}`)
    }
})

test('golden fixtures survive a decode/re-encode round-trip unchanged', () => {
    for (const fixture of fixtures) {
        const decoded = decodeBinaryNode(hexToBytes(fixture.hex))
        const reEncoded = encodeBinaryNode(decoded)
        assert.equal(bytesToHex(reEncoded), fixture.hex, `fixture: ${fixture.name}`)
    }
})
