import assert from 'node:assert/strict'
import test from 'node:test'

import { FIELD_P, GROUP_L } from '@crypto/math/constants'
import { encodeExtendedPoint, scalarMultBase } from '@crypto/math/edwards'
import { bigIntToBytesLE, bytesToBigIntLE } from '@crypto/math/le'
import { mod, modGroup, modInv } from '@crypto/math/mod'

test('little-endian bigint conversion round-trips', () => {
    const value = 0x0102_0304n
    const bytes = bigIntToBytesLE(value, 8)
    assert.equal(bytes.length, 8)
    assert.equal(bytesToBigIntLE(bytes), value)
})

test('mod arithmetic handles negative inputs and inversion', () => {
    assert.equal(mod(-1n), FIELD_P - 1n)
    assert.equal(modGroup(GROUP_L + 2n), 2n)

    const inv = modInv(5n)
    assert.equal(mod(5n * inv), 1n)
    assert.throws(() => modInv(0n), /inversion by zero/)
})

test('edwards scalar base multiplication encodes to 32-byte point', () => {
    const point = scalarMultBase(123n)
    const encoded = encodeExtendedPoint(point)

    assert.equal(encoded.length, 32)
    assert.ok(encoded.some((value) => value !== 0))
})
