import assert from 'node:assert/strict'
import test from 'node:test'

import { Ed25519, hkdf, randomBytesAsync, X25519 } from '@crypto'
import { aesCbcDecrypt, aesCbcEncrypt, aesCbcEncryptWithTrailer } from '@crypto/core'

test('aesCbcEncryptWithTrailer matches aesCbcEncrypt and reserves a zeroed tail', () => {
    const key = new Uint8Array(32)
    const iv = new Uint8Array(16)
    for (let i = 0; i < key.length; i += 1) key[i] = (i * 7 + 3) & 0xff
    for (let i = 0; i < iv.length; i += 1) iv[i] = (i * 11 + 5) & 0xff

    for (const length of [0, 1, 15, 16, 17, 1_000]) {
        const plaintext = new Uint8Array(length)
        for (let i = 0; i < length; i += 1) plaintext[i] = (i * 31) & 0xff

        const expected = aesCbcEncrypt(key, iv, plaintext)
        for (const trailer of [0, 1, 10]) {
            const out = aesCbcEncryptWithTrailer(key, iv, plaintext, trailer)
            assert.equal(out.length, expected.length + trailer, `length at ${length}/${trailer}`)
            assert.deepEqual(
                out.subarray(0, expected.length),
                expected,
                `ciphertext at ${length}/${trailer}`
            )
            assert.deepEqual(
                out.subarray(expected.length),
                new Uint8Array(trailer),
                `trailer must be zeroed at ${length}/${trailer}`
            )
            assert.deepEqual(aesCbcDecrypt(key, iv, out.subarray(0, expected.length)), plaintext)
        }
    }

    // Payloads past the internal chunk size go through several update() calls.
    const multiChunk = new Uint8Array(262_144 * 2 + 5)
    for (let i = 0; i < multiChunk.length; i += 1) multiChunk[i] = (i * 17) & 0xff
    const chunked = aesCbcEncryptWithTrailer(key, iv, multiChunk, 10)
    const chunkedExpected = aesCbcEncrypt(key, iv, multiChunk)
    assert.equal(chunked.length, chunkedExpected.length + 10)
    assert.deepEqual(chunked.subarray(0, chunkedExpected.length), chunkedExpected)

    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        assert.throws(
            () => aesCbcEncryptWithTrailer(key, iv, new Uint8Array(32), bad),
            /invalid trailer length/,
            `trailer ${bad} must be rejected`
        )
    }
})

test('crypto barrel exports primary APIs', async () => {
    const bytes = await randomBytesAsync(16)
    assert.equal(bytes.length, 16)

    const derived = hkdf(new Uint8Array(32).fill(1), null, new TextEncoder().encode('info'), 32)
    assert.equal(derived.length, 32)

    const x = await X25519.generateKeyPair()
    assert.equal(x.pubKey.length, 32)

    const e = await Ed25519.generateKeyPair()
    assert.equal(e.pubKey.length, 32)
})
