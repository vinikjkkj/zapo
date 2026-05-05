import assert from 'node:assert/strict'
import test from 'node:test'

import { CsTokenGenerator } from '@client/tokens/cs-token'
import {
    clampDuration,
    computeBucket,
    isTokenExpired,
    shouldSendNewToken,
    tokenExpirationCutoffS
} from '@client/tokens/tc-token'

test('tc token helpers compute bucket boundaries and expiration windows', () => {
    assert.equal(computeBucket(0, 60), 0)
    assert.equal(computeBucket(119, 60), 1)
    assert.equal(computeBucket(120, 60), 2)

    assert.equal(tokenExpirationCutoffS(600, 60, 2), 480)
    assert.equal(isTokenExpired(479, 600, 60, 2), true)
    assert.equal(isTokenExpired(480, 600, 60, 2), false)

    assert.equal(shouldSendNewToken(119, 120, 60), true)
    assert.equal(shouldSendNewToken(121, 179, 60), false)

    assert.equal(clampDuration(30, 20), 20)
    assert.equal(clampDuration(10, 20), 10)
})

test('cs token generator caches by account and salt and supports invalidation', async () => {
    const generator = new CsTokenGenerator()
    const saltA = new Uint8Array([1, 2, 3, 4, 5])
    const saltB = new Uint8Array([1, 2, 3, 4, 6])

    const first = generator.generate(saltA, '12345@lid')
    const cached = generator.generate(saltA, '12345@lid')
    assert.strictEqual(cached, first)

    const otherAccount = generator.generate(saltA, '99999@lid')
    assert.notStrictEqual(otherAccount, first)

    const changedSalt = generator.generate(saltB, '12345@lid')
    assert.notStrictEqual(changedSalt, first)

    generator.invalidate()
    const afterInvalidate = generator.generate(saltA, '12345@lid')
    assert.notStrictEqual(afterInvalidate, first)
    assert.deepEqual(afterInvalidate, first)
})
