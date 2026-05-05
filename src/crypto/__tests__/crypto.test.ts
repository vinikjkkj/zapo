import assert from 'node:assert/strict'
import test from 'node:test'

import { Ed25519, hkdf, randomBytesAsync, X25519 } from '@crypto'

test('crypto barrel exports primary APIs', async () => {
    const bytes = await randomBytesAsync(16)
    assert.equal(bytes.length, 16)

    const derived = hkdf(new Uint8Array(32).fill(1), null, 'info', 32)
    assert.equal(derived.length, 32)

    const x = await X25519.generateKeyPair()
    assert.equal(x.pubKey.length, 32)

    const e = await Ed25519.generateKeyPair()
    assert.equal(e.pubKey.length, 32)
})
