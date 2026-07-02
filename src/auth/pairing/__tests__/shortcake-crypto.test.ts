import assert from 'node:assert/strict'
import test from 'node:test'

import {
    decodePrimaryEphemeralIdentity,
    deriveEncryptionKey,
    deriveVerificationCode,
    encryptPairingRequest,
    generateCompanionEphemeralIdentity
} from '@auth/pairing/shortcake-crypto'
import { aesGcmDecrypt, hkdf, randomBytesAsync, sha256 } from '@crypto'
import { X25519 } from '@crypto/curves/X25519'
import { proto } from '@proto'
import { concatBytes, TEXT_ENCODER } from '@util/bytes'

const DEVICE_TYPE = proto.DeviceProps.PlatformType.CHROME

test('companion ephemeral identity carries a verifiable commitment', async () => {
    const companion = await generateCompanionEphemeralIdentity({
        ref: 'test-ref',
        deviceType: DEVICE_TYPE
    })

    assert.equal(companion.keyPair.pubKey.length, 32)
    assert.equal(companion.companionNonce.length, 32)
    assert.equal(companion.commitmentHash.length, 32)
    assert.ok(companion.prologuePayloadBytes.length > 0)

    const prologue = proto.ProloguePayload.decode(companion.prologuePayloadBytes)
    assert.deepEqual(
        new Uint8Array(prologue.companionEphemeralIdentity!),
        new Uint8Array(companion.companionEphemeralIdentityBytes)
    )
    assert.deepEqual(
        new Uint8Array(prologue.commitment!.hash!),
        new Uint8Array(companion.commitmentHash)
    )

    assert.deepEqual(
        new Uint8Array(
            sha256(
                concatBytes([companion.companionEphemeralIdentityBytes, companion.companionNonce])
            )
        ),
        new Uint8Array(companion.commitmentHash)
    )
})

test('verification code is deterministic and matches the independent derivation', async () => {
    const companionNonce = await randomBytesAsync(32)
    const primaryPub = (await X25519.generateKeyPair()).pubKey
    const primaryNonce = await randomBytesAsync(32)
    const primaryBytes = proto.PrimaryEphemeralIdentity.encode({
        publicKey: primaryPub,
        nonce: primaryNonce
    }).finish()

    const primary = decodePrimaryEphemeralIdentity(primaryBytes)
    const code = deriveVerificationCode(companionNonce, primary)
    assert.equal(code.length, 8)
    assert.equal(deriveVerificationCode(companionNonce, primary), code)

    const digest = sha256(concatBytes([companionNonce, primaryPub]))
    const expected = new Uint8Array(5)
    for (let i = 0; i < 5; i += 1) expected[i] = primaryNonce[i] ^ digest[i]
    const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTVWXYZ'
    let bitCount = 0
    let value = 0
    let manual = ''
    for (let i = 0; i < expected.length; i += 1) {
        value = (value << 8) | expected[i]
        bitCount += 8
        while (bitCount >= 5) {
            manual += ALPHABET[(value >>> (bitCount - 5)) & 31]
            bitCount -= 5
        }
    }
    if (bitCount > 0) manual += ALPHABET[(value << (5 - bitCount)) & 31]
    assert.equal(code, manual)
})

test('encryption key agrees with the primary side (ECDH symmetry)', async () => {
    const companionKp = await X25519.generateKeyPair()
    const primaryKp = await X25519.generateKeyPair()
    const ref = 'ecdh-ref'

    const companionKey = await deriveEncryptionKey({
        companionPrivKey: companionKp.privKey,
        primaryPublicKey: primaryKp.pubKey,
        deviceType: DEVICE_TYPE,
        ref
    })

    const sharedFromPrimary = await X25519.scalarMult(primaryKp.privKey, companionKp.pubKey)
    const salt = TEXT_ENCODER.encode(`Companion Pairing ${String(DEVICE_TYPE)} with ref ${ref}`)
    const info = TEXT_ENCODER.encode('Pairing Information Encryption Key')
    const primaryKey = hkdf(sharedFromPrimary, salt, info, 32)

    assert.equal(companionKey.length, 32)
    assert.deepEqual(companionKey, primaryKey)
})

test('pairing request envelope round-trips under the derived key', async () => {
    const key = await randomBytesAsync(32)
    const plaintext = TEXT_ENCODER.encode('pairing-data')

    const envelopeBytes = await encryptPairingRequest(key, plaintext)
    const envelope = proto.EncryptedPairingRequest.decode(envelopeBytes)
    assert.equal(new Uint8Array(envelope.iv!).length, 12)
    assert.ok(new Uint8Array(envelope.encryptedPayload!).length >= plaintext.length)

    const decrypted = aesGcmDecrypt(
        key,
        new Uint8Array(envelope.iv!),
        new Uint8Array(envelope.encryptedPayload!)
    )
    assert.deepEqual(decrypted, plaintext)
})

test('decode rejects malformed primary identity', () => {
    const badPublic = proto.PrimaryEphemeralIdentity.encode({
        publicKey: new Uint8Array(8),
        nonce: new Uint8Array(32)
    }).finish()
    assert.throws(() => decodePrimaryEphemeralIdentity(badPublic), /publicKey must be 32 bytes/)
})
