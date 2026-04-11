import assert from 'node:assert/strict'
import test from 'node:test'

import { toRawPubKey, toSerializedPubKey, X25519, xeddsaSign, xeddsaVerify } from '@crypto'
import {
    ADV_PREFIX_ACCOUNT_SIGNATURE,
    ADV_PREFIX_DEVICE_SIGNATURE,
    computeAdvIdentityHmac,
    generateDeviceSignature,
    verifyDeviceIdentityAccountSignature
} from '@signal/crypto/WaAdvSignature'
import { concatBytes, uint8Equal } from '@util/bytes'

function makeBytes(length: number, seed = 0): Uint8Array {
    const out = new Uint8Array(length)
    for (let index = 0; index < out.length; index += 1) {
        out[index] = (seed + index) & 0xff
    }
    return out
}

test('xeddsa sign/verify handles valid and invalid signatures', async () => {
    const keyPair = await X25519.generateKeyPair()
    const message = makeBytes(48, 3)

    const signature = await xeddsaSign(keyPair.privKey, message)
    assert.equal(signature.length, 64)

    const signatureLastByteBeforeVerify = signature[63]
    const verified = await xeddsaVerify(keyPair.pubKey, message, signature)
    assert.equal(verified, true)
    assert.equal(signature[63], signatureLastByteBeforeVerify)

    const tamperedSignature = new Uint8Array(signature)
    tamperedSignature[0] ^= 0x01
    assert.equal(await xeddsaVerify(keyPair.pubKey, message, tamperedSignature), false)
    assert.equal(await xeddsaVerify(keyPair.pubKey, message, new Uint8Array(63)), false)

    await assert.rejects(
        () => xeddsaSign(new Uint8Array(31), message),
        /invalid curve25519 private key length 31/
    )
})

test('xeddsa verify works with serialized (versioned) public keys via toRawPubKey', async () => {
    const keyPair = await X25519.generateKeyPair()
    const message = makeBytes(48, 3)
    const signature = await xeddsaSign(keyPair.privKey, message)
    const serialized = toSerializedPubKey(keyPair.pubKey)
    assert.equal(await xeddsaVerify(toRawPubKey(serialized), message, signature), true)
})

test('adv account/device signature helpers generate verifiable payload signatures', async () => {
    const identityKeyPair = await X25519.generateKeyPair()
    const accountKeyPair = await X25519.generateKeyPair()
    const details = makeBytes(24, 9)
    const identityPub = toSerializedPubKey(identityKeyPair.pubKey)
    const accountPub = toSerializedPubKey(accountKeyPair.pubKey)

    const accountMessage = concatBytes([ADV_PREFIX_ACCOUNT_SIGNATURE, details, identityPub])
    const accountSignature = await xeddsaSign(accountKeyPair.privKey, accountMessage)
    assert.equal(
        await verifyDeviceIdentityAccountSignature(
            details,
            accountSignature,
            identityPub,
            accountPub
        ),
        true
    )
    assert.equal(
        await verifyDeviceIdentityAccountSignature(
            details,
            accountSignature,
            identityPub,
            accountPub,
            true
        ),
        false
    )

    const deviceSignature = await generateDeviceSignature(details, identityKeyPair, accountPub)
    const deviceMessage = concatBytes([
        ADV_PREFIX_DEVICE_SIGNATURE,
        details,
        identityKeyPair.pubKey,
        accountPub
    ])
    assert.equal(await xeddsaVerify(toRawPubKey(identityPub), deviceMessage, deviceSignature), true)
})

test('adv identity hmac is deterministic for same key and details', async () => {
    const secretKey = makeBytes(32, 1)
    const details = makeBytes(64, 11)

    const left = await computeAdvIdentityHmac(secretKey, details)
    const right = await computeAdvIdentityHmac(secretKey, details)

    assert.equal(left.length, right.length)
    assert.equal(uint8Equal(left, right), true)
})
