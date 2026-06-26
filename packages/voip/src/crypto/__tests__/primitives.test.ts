import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from 'zapo-js/util'

import { aesCtr128, hmacSha1, randomBytes, randomInt } from '../primitives.js'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

test('randomBytes returns the requested length and varies between calls', () => {
    const a = randomBytes(16)
    const b = randomBytes(16)
    assert.equal(a.length, 16)
    assert.equal(b.length, 16)
    assert.notDeepEqual([...a], [...b])
})

test('randomInt stays within [min, max)', () => {
    for (let i = 0; i < 200; i++) {
        const n = randomInt(5, 10)
        assert.ok(n >= 5 && n < 10, `out of range: ${n}`)
    }
})

test('hmacSha1 matches the known HMAC-SHA1 test vector', () => {
    const mac = hmacSha1(enc('key'), enc('The quick brown fox jumps over the lazy dog'))
    assert.equal(bytesToHex(mac), 'de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9')
})

test('hmacSha1 concatenates parts identically to a single buffer', () => {
    const joined = hmacSha1(enc('key'), enc('The quick brown fox '), enc('jumps over the lazy dog'))
    const single = hmacSha1(enc('key'), enc('The quick brown fox jumps over the lazy dog'))
    assert.deepEqual([...joined], [...single])
})

test('aesCtr128 round-trips (CTR keystream is symmetric)', () => {
    const key = randomBytes(16)
    const iv = randomBytes(16)
    const plaintext = enc('whatsapp voip srtp payload')

    const ciphertext = aesCtr128(key, iv, plaintext)
    assert.notDeepEqual([...ciphertext], [...plaintext])

    const decrypted = aesCtr128(key, iv, ciphertext)
    assert.deepEqual([...decrypted], [...plaintext])
})
