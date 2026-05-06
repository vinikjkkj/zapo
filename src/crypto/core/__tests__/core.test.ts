import assert from 'node:assert/strict'
import test from 'node:test'

import { hkdf, hkdfSplit } from '@crypto/core/hkdf'
import {
    prependVersion,
    readVersionedContent,
    toRawPubKey,
    toSerializedPubKey,
    versionByte
} from '@crypto/core/keys'
import { buildNonce } from '@crypto/core/nonce'
import { aesGcmDecrypt, aesGcmEncrypt, hmacSha256Sign, sha256 } from '@crypto/core/primitives'
import { randomBytesAsync, randomFillAsync, randomIntAsync } from '@crypto/core/random'
import { assertByteLength, bytesToBase64UrlSafe, decodeBase64Url } from '@util/bytes'

test('hkdf derivation and split are deterministic with same inputs', async () => {
    const ikm = new Uint8Array(32).fill(1)
    const salt = new Uint8Array(32).fill(2)

    const one = hkdf(ikm, salt, 'info', 32)
    const two = hkdf(ikm, salt, 'info', 32)
    assert.deepEqual(one, two)
    assert.equal(one.length, 32)

    const [left, right] = hkdfSplit(ikm, salt, 'split-info')
    assert.equal(left.length, 32)
    assert.equal(right.length, 32)
    assert.notDeepEqual(left, right)
})

test('nonce and versioned key helpers enforce protocol constraints', () => {
    assert.deepEqual(buildNonce(0x0102_0304), new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]))
    assert.throws(() => buildNonce(0x1_0000_0000), /nonce counter overflow/)

    const raw = new Uint8Array(32).fill(7)
    const serialized = toSerializedPubKey(raw)
    assert.equal(serialized.length, 33)
    assert.deepEqual(toRawPubKey(serialized), raw)

    assert.equal(versionByte(5, 3), 0x53)
    const payload = new Uint8Array([8, 9, 10])
    const wrapped = prependVersion(payload, 3)
    assert.deepEqual(readVersionedContent(wrapped, 3, 0), payload)
    assert.throws(() => readVersionedContent(new Uint8Array([]), 3, 0), /is empty/)
})

test('primitive crypto functions encrypt/decrypt and sign deterministically', async () => {
    const keyRaw = new Uint8Array(32).fill(4)
    const nonce = new Uint8Array(12).fill(5)
    const plaintext = new Uint8Array([1, 2, 3, 4, 5])

    const ciphertext = aesGcmEncrypt(keyRaw, nonce, plaintext)
    const decrypted = aesGcmDecrypt(keyRaw, nonce, ciphertext)
    assert.deepEqual(decrypted, plaintext)

    const hmacKey = new Uint8Array(32).fill(6)
    const sig1 = hmacSha256Sign(hmacKey, new Uint8Array([1, 2]))
    const sig2 = hmacSha256Sign(hmacKey, new Uint8Array([1, 2]))
    assert.deepEqual(sig1, sig2)

    const digest = sha256(new Uint8Array([7]))
    assert.equal(digest.length, 32)
})

test('encoding and random helpers are compatible with URL-safe payloads', async () => {
    const raw = new Uint8Array(32).fill(12)
    const encoded = bytesToBase64UrlSafe(raw)
    const decoded = decodeBase64Url(encoded, 'field')
    assert.deepEqual(decoded, raw)

    assert.doesNotThrow(() => assertByteLength(raw, 32, 'x must be 32 bytes'))
    assert.throws(
        () => assertByteLength(new Uint8Array(31), 32, 'x must be 32 bytes'),
        /must be 32 bytes/
    )

    const randomBytes = await randomBytesAsync(24)
    assert.equal(randomBytes.length, 24)

    const preallocated = new Uint8Array(12)
    const filled = await randomFillAsync(preallocated)
    assert.equal(filled, preallocated)
    assert.equal(filled.length, 12)

    const partial = new Uint8Array(8).fill(7)
    await randomFillAsync(partial, 2, 4)
    assert.deepEqual(partial.subarray(0, 2), new Uint8Array([7, 7]))
    assert.deepEqual(partial.subarray(6, 8), new Uint8Array([7, 7]))

    const randomInt = await randomIntAsync(1, 3)
    assert.ok(randomInt >= 1 && randomInt < 3)
})
