import assert from 'node:assert/strict'
import { test } from 'node:test'

import { randomBytes, randomInt } from '../random.js'

test('randomBytes returns the requested length and varies between calls', () => {
    const a = randomBytes(16)
    const b = randomBytes(16)
    assert.equal(a.length, 16)
    assert.equal(b.length, 16)
    assert.notDeepEqual([...a], [...b])
})

test('randomInt stays within [min, max) and reaches both ends', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 200; i++) {
        const n = randomInt(5, 7)
        assert.ok(n === 5 || n === 6, `out of range: ${n}`)
        seen.add(n)
    }
    assert.deepEqual([...seen].sort(), [5, 6])
})

/** The widest range the media plane asks for: a full 32-bit RTP timestamp. */
test('randomInt covers a full 32-bit range', () => {
    for (let i = 0; i < 200; i++) {
        const n = randomInt(0, 0x1_0000_0000)
        assert.ok(Number.isInteger(n) && n >= 0 && n <= 0xffffffff, `out of range: ${n}`)
    }
})

test('randomInt rejects an empty, inverted or oversized range', () => {
    assert.throws(() => randomInt(5, 5), RangeError)
    assert.throws(() => randomInt(7, 5), RangeError)
    assert.throws(() => randomInt(0, 0x1_0000_0001), RangeError)
    assert.throws(() => randomInt(0.5, 3), RangeError)
})
