import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hexSsrc } from '../bytes.js'

import { hexToBytes } from './_helpers.js'

test('hexToBytes refuses a pair with only a valid prefix', () => {
    assert.deepEqual(hexToBytes('00Ff1a'), new Uint8Array([0x00, 0xff, 0x1a]))
    assert.throws(() => hexToBytes('1g'), /invalid hex at 0/)
    assert.throws(() => hexToBytes('00 1'), /invalid hex at 2/)
})

test('hexSsrc writes an SSRC as logged, unpadded', () => {
    assert.equal(hexSsrc(0x0a0b0c0d), '0xa0b0c0d')
    assert.equal(hexSsrc(0xffffffff), '0xffffffff')
    assert.equal(hexSsrc(0), '0x0')
})
