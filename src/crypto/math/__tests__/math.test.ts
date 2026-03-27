import assert from 'node:assert/strict'
import test from 'node:test'

import { FIELD_P, GROUP_L } from '@crypto/math/constants'
import { encodeExtendedPoint, scalarMultBase } from '@crypto/math/edwards'
import {
    fe,
    feAdd,
    feFromBigInt,
    feInv,
    feMul,
    feNeg,
    feSqr,
    feSub,
    feToBigInt
} from '@crypto/math/fe'
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

test('fe arithmetic matches BigInt reference for random values', () => {
    const p = FIELD_P
    const values = [
        0n,
        1n,
        19n,
        p - 1n,
        p - 19n,
        0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn % p,
        0xdeadbeefcafebabe0000000000000001deadbeefcafebabe0000000000000001n % p
    ]

    for (const a of values) {
        for (const b of values) {
            const aFe = feFromBigInt(a)
            const bFe = feFromBigInt(b)
            const out = fe()

            // mul
            feMul(out, aFe, bFe)
            assert.equal(feToBigInt(out), (a * b) % p, `mul(${a}, ${b})`)

            // add
            feAdd(out, aFe, bFe)
            assert.equal(feToBigInt(out), (a + b) % p, `add(${a}, ${b})`)

            // sub
            feSub(out, aFe, bFe)
            assert.equal(feToBigInt(out), (((a - b) % p) + p) % p, `sub(${a}, ${b})`)
        }

        // sqr
        const aFe = feFromBigInt(a)
        const out = fe()
        feSqr(out, aFe)
        assert.equal(feToBigInt(out), (a * a) % p, `sqr(${a})`)

        // neg
        feNeg(out, aFe)
        assert.equal(feToBigInt(out), a === 0n ? 0n : p - a, `neg(${a})`)

        // inv (skip 0)
        if (a !== 0n) {
            feInv(out, aFe)
            const inv = feToBigInt(out)
            assert.equal((a * inv) % p, 1n, `inv(${a})`)
        }
    }
})

test('fe round-trip through BigInt preserves value', () => {
    const values = [0n, 1n, FIELD_P - 1n, (1n << 128n) - 1n, (1n << 255n) - 20n]
    for (const v of values) {
        assert.equal(feToBigInt(feFromBigInt(v)), v, `round-trip ${v}`)
    }
})

test('fe aliased operations produce correct results', () => {
    const p = FIELD_P
    const a = 0x123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdefn % p
    const b = 0xdeadbeefcafebabe0000000000000001deadbeefcafebabe0000000000000001n % p

    // feMul(a, a, b) — output aliases first input
    const aFe1 = feFromBigInt(a)
    feMul(aFe1, aFe1, feFromBigInt(b))
    assert.equal(feToBigInt(aFe1), (a * b) % p, 'feMul(a, a, b)')

    // feMul(a, b, a) — output aliases second input
    const aFe2 = feFromBigInt(a)
    feMul(aFe2, feFromBigInt(b), aFe2)
    assert.equal(feToBigInt(aFe2), (a * b) % p, 'feMul(a, b, a)')

    // feAdd(c, c, c) — output aliases both inputs
    const cFe = feFromBigInt(a)
    feAdd(cFe, cFe, cFe)
    assert.equal(feToBigInt(cFe), (a + a) % p, 'feAdd(c, c, c)')

    // feSub(c, c, c) — result should be 0
    const dFe = feFromBigInt(a)
    feSub(dFe, dFe, dFe)
    assert.equal(feToBigInt(dFe), 0n, 'feSub(c, c, c)')

    // feNeg(a, a) — output aliases input
    const eFe = feFromBigInt(a)
    feNeg(eFe, eFe)
    assert.equal(feToBigInt(eFe), p - a, 'feNeg(a, a)')

    // feSqr(a, a) — output aliases input
    const fFe = feFromBigInt(a)
    feSqr(fFe, fFe)
    assert.equal(feToBigInt(fFe), (a * a) % p, 'feSqr(a, a)')
})

test('edwards scalar base multiplication encodes to 32-byte point', () => {
    const point = scalarMultBase(123n)
    const encoded = encodeExtendedPoint(point)

    assert.equal(encoded.length, 32)
    assert.ok(encoded.some((value) => value !== 0))

    // Different scalars produce different points
    const encoded2 = encodeExtendedPoint(scalarMultBase(456n))
    assert.notDeepEqual(encoded, encoded2)

    // Same scalar is deterministic
    const encoded3 = encodeExtendedPoint(scalarMultBase(123n))
    assert.deepEqual(encoded, encoded3)
})
