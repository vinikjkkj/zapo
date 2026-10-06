import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hexToBytes } from './_helpers.js'

test('hexToBytes refuses a pair with only a valid prefix', () => {
    assert.deepEqual(hexToBytes('00Ff1a'), new Uint8Array([0x00, 0xff, 0x1a]))
    assert.throws(() => hexToBytes('1g'), /invalid hex at 0/)
    assert.throws(() => hexToBytes('00 1'), /invalid hex at 2/)
})
