import assert from 'node:assert/strict'
import test from 'node:test'

import {
    ML_KEM_1024_CIPHERTEXT_BYTES,
    ML_KEM_1024_PUBLIC_KEY_BYTES,
    ML_KEM_1024_SHARED_SECRET_BYTES
} from '@crypto/kem/constants'
import {
    generateKemKeyPair,
    isMlKemSupported,
    kemDecapsulate,
    kemEncapsulate
} from '@crypto/kem/MlKem'
import { uint8Equal } from '@util/bytes'

const skip = !isMlKemSupported()

test('ml-kem-1024 keygen yields a raw 1568-byte public key', { skip }, async () => {
    const pair = await generateKemKeyPair()
    assert.equal(pair.pubKey.length, ML_KEM_1024_PUBLIC_KEY_BYTES)
    assert.ok(pair.privKey.length > 0)
})

test('ml-kem-1024 encapsulate/decapsulate agree on the shared secret', { skip }, async () => {
    const pair = await generateKemKeyPair()
    const { ciphertext, sharedSecret } = kemEncapsulate(pair.pubKey)

    assert.equal(ciphertext.length, ML_KEM_1024_CIPHERTEXT_BYTES)
    assert.equal(sharedSecret.length, ML_KEM_1024_SHARED_SECRET_BYTES)

    const recovered = kemDecapsulate(pair.privKey, ciphertext)
    assert.ok(uint8Equal(sharedSecret, recovered))
})

test('ml-kem-1024 rejects a tampered ciphertext with a different secret', { skip }, async () => {
    const pair = await generateKemKeyPair()
    const { ciphertext, sharedSecret } = kemEncapsulate(pair.pubKey)

    const tampered = ciphertext.slice()
    tampered[0] ^= 0xff

    const recovered = kemDecapsulate(pair.privKey, tampered)
    assert.ok(!uint8Equal(sharedSecret, recovered))
})

test('ml-kem-1024 encapsulate validates the public key length', { skip }, () => {
    assert.throws(() => kemEncapsulate(new Uint8Array(10)))
})
