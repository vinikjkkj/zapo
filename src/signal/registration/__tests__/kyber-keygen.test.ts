import assert from 'node:assert/strict'
import test from 'node:test'

import { xeddsaVerify } from '@crypto/core/xeddsa'
import { X25519 } from '@crypto/curves/X25519'
import { ML_KEM_1024_PUBLIC_KEY_BYTES } from '@crypto/kem/constants'
import { isMlKemSupported } from '@crypto/kem/MlKem'
import { generateKyberPreKey } from '@signal/registration/keygen'

const skip = !isMlKemSupported()

test(
    'generateKyberPreKey signs the raw KEM public key with the identity key',
    { skip },
    async () => {
        const identity = await X25519.generateKeyPair()
        const record = await generateKyberPreKey(42, identity.privKey)

        assert.equal(record.keyId, 42)
        assert.equal(record.keyPair.pubKey.length, ML_KEM_1024_PUBLIC_KEY_BYTES)
        assert.equal(record.lastResort, false)
        assert.equal(record.signature.length, 64)

        const ok = await xeddsaVerify(identity.pubKey, record.keyPair.pubKey, record.signature)
        assert.ok(ok)
    }
)

test('generateKyberPreKey marks the last-resort key', { skip }, async () => {
    const identity = await X25519.generateKeyPair()
    const record = await generateKyberPreKey(7, identity.privKey, true)
    assert.equal(record.lastResort, true)
})

test('generateKyberPreKey rejects ids outside the 3-byte wire range', { skip }, async () => {
    const identity = await X25519.generateKeyPair()
    await assert.rejects(() => generateKyberPreKey(-1, identity.privKey), /invalid kyber prekey id/)
    await assert.rejects(
        () => generateKyberPreKey(16_777_215, identity.privKey),
        /invalid kyber prekey id/
    )
    const edge = await generateKyberPreKey(16_777_214, identity.privKey)
    assert.equal(edge.keyId, 16_777_214)
})
