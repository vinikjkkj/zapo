import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readUInt32BE, readUInt32LE, writeUInt32LE } from '../bytes.js'

test('32-bit helpers read and write both byte orders', () => {
    const buf = Uint8Array.of(0x12, 0x34, 0x56, 0x78)
    assert.equal(readUInt32BE(buf, 0), 0x12345678)
    assert.equal(readUInt32LE(buf, 0), 0x78563412)

    const le = new Uint8Array(4)
    writeUInt32LE(le, 0x89abcdef, 0)
    assert.deepEqual(le, Uint8Array.of(0xef, 0xcd, 0xab, 0x89))
    assert.equal(readUInt32LE(le, 0), 0x89abcdef)
})

test('32-bit helpers refuse an access past the end', () => {
    assert.throws(() => readUInt32BE(new Uint8Array(3), 0), RangeError)
    assert.throws(() => writeUInt32LE(new Uint8Array(4), 1, 1), RangeError)
})
