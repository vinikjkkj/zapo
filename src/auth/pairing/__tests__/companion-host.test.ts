import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildSignedCompanionIdentity,
    completePrimaryHandshake,
    parseCompanionQr,
    preparePrimaryHello
} from '@auth/pairing/companion-host'
import {
    aesCtrDecrypt,
    aesCtrEncrypt,
    aesGcmEncrypt,
    hkdf,
    pbkdf2Sha256,
    randomBytesAsync,
    toRawPubKey,
    toSerializedPubKey,
    X25519
} from '@crypto'
import { proto } from '@proto'
import { WA_PAIRING_KDF_INFO } from '@protocol'
import {
    computeAdvIdentityHmac,
    verifyDeviceIdentityAccountSignature,
    verifyKeyIndexListSignature
} from '@signal'
import { bytesToBase64UrlSafe, concatBytes, TEXT_ENCODER, uint8Equal } from '@util/bytes'

const PBKDF2_ITERATIONS = 131_072

test('parseCompanionQr splits trailing fields and preserves a comma-bearing ref', () => {
    const noise = new Uint8Array([1, 2, 3])
    const identity = new Uint8Array([4, 5, 6])
    const adv = new Uint8Array([7, 8, 9])
    const ref = 'ref,with,commas'
    const qr = [
        ref,
        bytesToBase64UrlSafe(noise),
        bytesToBase64UrlSafe(identity),
        bytesToBase64UrlSafe(adv),
        'CHROME'
    ].join(',')

    const parsed = parseCompanionQr(qr)
    assert.equal(parsed.ref, ref)
    assert.equal(parsed.platform, 'CHROME')
    assert.deepEqual([...parsed.noisePublicKey], [1, 2, 3])
    assert.deepEqual([...parsed.identityPublicKey], [4, 5, 6])
    assert.deepEqual([...parsed.advSecretKey], [7, 8, 9])
})

test('parseCompanionQr rejects too-few fields', () => {
    assert.throws(() => parseCompanionQr('a,b,c'), /at least 5/)
})

test('signed companion identity verifies with the companion-side account check', async () => {
    const accountIdentityKeyPair = await X25519.generateKeyPair()
    const companionIdentityKeyPair = await X25519.generateKeyPair()
    // Any 32 secret bytes stand in for the companion's advSecret from its QR.
    const advSecretKey = (await X25519.generateKeyPair()).privKey
    const companionIdentityPublicKey = companionIdentityKeyPair.pubKey

    const { deviceIdentityBytes, keyIndexListBytes } = await buildSignedCompanionIdentity({
        accountIdentityKeyPair,
        companionIdentityPublicKey,
        advSecretKey,
        rawId: 12_345,
        keyIndex: 1,
        timestampSeconds: 1_700_000_000,
        validIndexes: [0, 1]
    })

    const wrapped = proto.ADVSignedDeviceIdentityHMAC.decode(deviceIdentityBytes)
    const wrappedDetails = wrapped.details!
    const expectedHmac = computeAdvIdentityHmac(advSecretKey, wrappedDetails)
    assert.equal(uint8Equal(expectedHmac, wrapped.hmac!), true)

    const signed = proto.ADVSignedDeviceIdentity.decode(wrappedDetails)
    assert.equal(
        await verifyDeviceIdentityAccountSignature(
            signed.details!,
            signed.accountSignature!,
            companionIdentityPublicKey,
            signed.accountSignatureKey!
        ),
        true
    )

    const signedList = proto.ADVSignedKeyIndexList.decode(keyIndexListBytes)
    assert.equal(
        await verifyKeyIndexListSignature(
            signedList.details!,
            signedList.accountSignature!,
            toSerializedPubKey(accountIdentityKeyPair.pubKey)
        ),
        true
    )
})

// Wraps an ephemeral public key the way a companion's createCompanionHello does.
async function wrapEphemeral(code: string, ephemeralPub: Uint8Array): Promise<Uint8Array> {
    const salt = await randomBytesAsync(32)
    const counter = await randomBytesAsync(16)
    const key = await pbkdf2Sha256(TEXT_ENCODER.encode(code), salt, PBKDF2_ITERATIONS, 32)
    return concatBytes([salt, counter, aesCtrEncrypt(key, counter, ephemeralPub)])
}

test('link-code primary handshake derives the same advSecret as the companion', async () => {
    const code = 'ABCD2345'
    const companionEphemeral = await X25519.generateKeyPair()
    const companionIdentity = await X25519.generateKeyPair()
    const primaryIdentity = await X25519.generateKeyPair()

    const wrappedCompanionEphemeralPub = await wrapEphemeral(code, companionEphemeral.pubKey)

    // Primary step 1.
    const prepared = await preparePrimaryHello({ pairingCode: code, wrappedCompanionEphemeralPub })

    // Companion's completeCompanionFinish: unwrap the primary ephemeral, build bundle.
    const pKey = await pbkdf2Sha256(
        TEXT_ENCODER.encode(code),
        prepared.wrappedPrimaryEphemeralPub.subarray(0, 32),
        PBKDF2_ITERATIONS,
        32
    )
    const primaryEphemeralPub = aesCtrDecrypt(
        pKey,
        prepared.wrappedPrimaryEphemeralPub.subarray(32, 48),
        prepared.wrappedPrimaryEphemeralPub.subarray(48)
    )
    const sharedEphemeralCompanion = await X25519.scalarMult(
        companionEphemeral.privKey,
        primaryEphemeralPub
    )
    const sharedIdentityCompanion = await X25519.scalarMult(
        companionIdentity.privKey,
        toRawPubKey(primaryIdentity.pubKey)
    )
    const bundleSalt = await randomBytesAsync(32)
    const bundleIv = await randomBytesAsync(12)
    const bundleSecret = await randomBytesAsync(32)
    const bundleKey = hkdf(
        sharedEphemeralCompanion,
        bundleSalt,
        WA_PAIRING_KDF_INFO.LINK_CODE_BUNDLE,
        32
    )
    const plaintextBundle = concatBytes([
        companionIdentity.pubKey,
        toRawPubKey(primaryIdentity.pubKey),
        bundleSecret
    ])
    const wrappedKeyBundle = concatBytes([
        bundleSalt,
        bundleIv,
        aesGcmEncrypt(bundleKey, bundleIv, plaintextBundle)
    ])
    const advSecretCompanion = hkdf(
        concatBytes([sharedEphemeralCompanion, sharedIdentityCompanion, bundleSecret]),
        null,
        WA_PAIRING_KDF_INFO.ADV_SECRET,
        32
    )

    // The shared ephemeral must match on both sides.
    assert.equal(uint8Equal(prepared.sharedEphemeral, sharedEphemeralCompanion), true)

    // Primary step 2 -> advSecret must equal what the companion derived.
    const advSecretPrimary = await completePrimaryHandshake({
        sharedEphemeral: prepared.sharedEphemeral,
        wrappedKeyBundle,
        companionIdentityPub: companionIdentity.pubKey,
        primaryIdentityKeyPair: primaryIdentity
    })
    assert.equal(uint8Equal(advSecretPrimary, advSecretCompanion), true)
})

test('completePrimaryHandshake rejects a bundle bound to a different primary identity', async () => {
    const code = 'WXYZ6789'
    const companionEphemeral = await X25519.generateKeyPair()
    const companionIdentity = await X25519.generateKeyPair()
    const primaryIdentity = await X25519.generateKeyPair()
    const wrongPrimary = await X25519.generateKeyPair()

    const wrappedCompanionEphemeralPub = await wrapEphemeral(code, companionEphemeral.pubKey)
    const prepared = await preparePrimaryHello({ pairingCode: code, wrappedCompanionEphemeralPub })

    const bundleSalt = await randomBytesAsync(32)
    const bundleIv = await randomBytesAsync(12)
    const bundleKey = hkdf(
        prepared.sharedEphemeral,
        bundleSalt,
        WA_PAIRING_KDF_INFO.LINK_CODE_BUNDLE,
        32
    )
    const plaintextBundle = concatBytes([
        companionIdentity.pubKey,
        toRawPubKey(wrongPrimary.pubKey),
        await randomBytesAsync(32)
    ])
    const wrappedKeyBundle = concatBytes([
        bundleSalt,
        bundleIv,
        aesGcmEncrypt(bundleKey, bundleIv, plaintextBundle)
    ])

    await assert.rejects(
        () =>
            completePrimaryHandshake({
                sharedEphemeral: prepared.sharedEphemeral,
                wrappedKeyBundle,
                companionIdentityPub: companionIdentity.pubKey,
                primaryIdentityKeyPair: primaryIdentity
            }),
        /primary identity mismatch/
    )
})
