import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    concatBytes,
    readBigUInt64BE,
    readUInt16BE,
    readUInt32BE,
    readUInt32LE,
    toArrayBuffer,
    toBytesView,
    writeBigUInt64BE,
    writeUInt16BE,
    writeUInt32BE,
    writeUInt32LE
} from '../bytes.js'

test('read/write integer helpers round-trip BE and LE', () => {
    const buf16 = new Uint8Array(2)
    writeUInt16BE(buf16, 0xabcd, 0)
    assert.equal(readUInt16BE(buf16, 0), 0xabcd)

    const buf32 = new Uint8Array(4)
    writeUInt32BE(buf32, 0x12345678, 0)
    assert.equal(readUInt32BE(buf32, 0), 0x12345678)

    const bufLe = new Uint8Array(4)
    writeUInt32LE(bufLe, 0x89abcdef, 0)
    assert.equal(readUInt32LE(bufLe, 0), 0x89abcdef)

    const buf64 = new Uint8Array(8)
    writeBigUInt64BE(buf64, 0x0123456789abcdefn, 0)
    assert.equal(readBigUInt64BE(buf64, 0), 0x0123456789abcdefn)
})

test('concatBytes joins arrays in order', () => {
    const out = concatBytes([new Uint8Array([1, 2]), new Uint8Array([3])])
    assert.deepEqual(out, new Uint8Array([1, 2, 3]))
})

test('toBytesView normalizes ArrayBuffer and ArrayBufferView', () => {
    const ab = new Uint8Array([4, 5, 6]).buffer
    assert.deepEqual(toBytesView(ab), new Uint8Array([4, 5, 6]))

    const view = new DataView(new Uint8Array([7, 8, 9, 10]).buffer, 1, 2)
    assert.deepEqual(toBytesView(view), new Uint8Array([8, 9]))
})

test('toArrayBuffer returns a standalone ArrayBuffer slice', () => {
    const bytes = new Uint8Array([1, 2, 3])
    const ab = toArrayBuffer(bytes)
    assert.ok(ab instanceof ArrayBuffer)
    assert.deepEqual(new Uint8Array(ab), bytes)
})
