import assert from 'node:assert/strict'
import test from 'node:test'

import { createServerClock } from '@util/clock'

test('createServerClock adds the skew to Date.now() for nowMs', () => {
    const clock = createServerClock(() => 5_000)
    const before = Date.now()
    const observed = clock.nowMs()
    const after = Date.now()
    assert.ok(observed - before >= 5_000)
    assert.ok(observed - after <= 5_001)
})

test('createServerClock floors corrected millis for nowSeconds', () => {
    const clock = createServerClock(() => 3_500)
    const localMs = Date.now()
    const expected = Math.floor((localMs + 3_500) / 1_000)
    const observed = clock.nowSeconds()
    assert.ok(Math.abs(observed - expected) <= 1)
})

test('createServerClock falls back to Date.now() when skew is null/undefined/NaN', () => {
    const candidates: (number | null | undefined)[] = [null, undefined, Number.NaN]
    for (const skew of candidates) {
        const clock = createServerClock(() => skew)
        const before = Date.now()
        const observed = clock.nowMs()
        const after = Date.now()
        assert.ok(
            observed >= before && observed <= after,
            `nowMs(${String(skew)}) = ${observed} should be between ${before} and ${after}`
        )
    }
})

test('createServerClock accepts negative skew (local clock ahead of server)', () => {
    const clock = createServerClock(() => -2_000)
    const before = Date.now()
    const observed = clock.nowMs()
    assert.ok(observed <= before - 1_999)
})

test('createServerClock reads the skew getter on every call', () => {
    let current: number | null = null
    const clock = createServerClock(() => current)
    const baseline = clock.nowMs()
    current = 10_000
    const skewed = clock.nowMs()
    assert.ok(skewed - baseline >= 9_000)
})
