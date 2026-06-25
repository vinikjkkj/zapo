import assert from 'node:assert/strict'
import { test } from 'node:test'

import { generateSecureSsrc } from '../ssrc.js'

test('generateSecureSsrc is deterministic for fixed inputs', () => {
    const a = generateSecureSsrc('CALLID1234567890', '12345@lid')
    const b = generateSecureSsrc('CALLID1234567890', '12345@lid')
    const c = generateSecureSsrc('CALLID1234567890', '12345@lid', 1)

    assert.equal(a, b)
    assert.notEqual(a, c)
})
