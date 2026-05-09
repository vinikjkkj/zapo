import assert from 'node:assert/strict'
import test from 'node:test'

import { decodeFromJson, encodeForJson } from '../serializer'

test('encodes Uint8Array as $bytes base64', () => {
    const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])
    const encoded = encodeForJson(bytes)
    assert.deepStrictEqual(encoded, { $bytes: '3q2+7w==' })
})

test('encodes nested Uint8Array inside object', () => {
    const encoded = encodeForJson({ key: new Uint8Array([1, 2, 3]) })
    assert.deepStrictEqual(encoded, { key: { $bytes: 'AQID' } })
})

test('encodes BigInt as $bigint string', () => {
    const encoded = encodeForJson(123456789n)
    assert.deepStrictEqual(encoded, { $bigint: '123456789' })
})

test('encodes Date as $date iso', () => {
    const d = new Date('2026-01-01T00:00:00.000Z')
    const encoded = encodeForJson(d)
    assert.deepStrictEqual(encoded, { $date: '2026-01-01T00:00:00.000Z' })
})

test('encodes Error as $error with name/message/stack', () => {
    const err = new Error('boom')
    err.name = 'CustomError'
    const encoded = encodeForJson(err) as {
        $error: { name: string; message: string; stack?: string }
    }
    assert.equal(encoded.$error.name, 'CustomError')
    assert.equal(encoded.$error.message, 'boom')
    assert.equal(typeof encoded.$error.stack, 'string')
})

test('encodes Map and Set with markers', () => {
    const m = new Map<string, number>([
        ['a', 1],
        ['b', 2]
    ])
    const s = new Set([1, 2, 3])
    assert.deepStrictEqual(encodeForJson(m), {
        $map: [
            ['a', 1],
            ['b', 2]
        ]
    })
    assert.deepStrictEqual(encodeForJson(s), { $set: [1, 2, 3] })
})

test('breaks circular references with [Circular]', () => {
    const obj: { self?: unknown; v: number } = { v: 1 }
    obj.self = obj
    const encoded = encodeForJson(obj) as { v: number; self: string }
    assert.equal(encoded.v, 1)
    assert.equal(encoded.self, '[Circular]')
})

test('decodes $bytes back to Uint8Array', () => {
    const decoded = decodeFromJson({ $bytes: 'AQID' })
    assert.ok(decoded instanceof Uint8Array)
    assert.deepStrictEqual(Array.from(decoded), [1, 2, 3])
})

test('decodes nested $bytes inside arrays', () => {
    const decoded = decodeFromJson([{ $bytes: 'AQID' }, 'plain']) as unknown[]
    assert.ok(decoded[0] instanceof Uint8Array)
    assert.equal(decoded[1], 'plain')
})

test('decodes $bigint back to BigInt', () => {
    const decoded = decodeFromJson({ $bigint: '999999999999' })
    assert.equal(decoded, 999999999999n)
})

test('encode/decode roundtrip preserves structure', () => {
    const input = {
        text: 'hello',
        bytes: new Uint8Array([1, 2, 3]),
        big: 42n,
        nested: { list: [1, 'two', new Uint8Array([9])] }
    }
    const encoded = encodeForJson(input)
    const json = JSON.parse(JSON.stringify(encoded))
    const decoded = decodeFromJson(json) as typeof input
    assert.equal(decoded.text, 'hello')
    assert.deepStrictEqual(Array.from(decoded.bytes), [1, 2, 3])
    assert.equal(decoded.big, 42n)
    assert.deepStrictEqual(Array.from(decoded.nested.list[2] as Uint8Array), [9])
})
