import { CROCKFORD_ALPHABET, PBKDF2_ITERATIONS } from '@auth/pairing/constants'
import {
    aesCtrDecrypt,
    aesCtrEncrypt,
    aesGcmEncrypt,
    hkdf,
    importAesGcmKey,
    pbkdf2DeriveAesCtrKey,
    randomBytesAsync
} from '@crypto'
import type { SignalKeyPair } from '@crypto/curves/types'
import { X25519 } from '@crypto/curves/X25519'
import { WA_PAIRING_KDF_INFO } from '@protocol/constants'
import { concatBytes, TEXT_ENCODER } from '@util/bytes'

function bytesToCrockford(bytes: Uint8Array): string {
    let bitCount = 0
    let value = 0
    let out = ''
    for (let i = 0; i < bytes.length; i += 1) {
        value = (value << 8) | bytes[i]
        bitCount += 8
        while (bitCount >= 5) {
            out += CROCKFORD_ALPHABET[(value >>> (bitCount - 5)) & 31]
            bitCount -= 5
        }
    }
    if (bitCount > 0) {
        out += CROCKFORD_ALPHABET[(value << (5 - bitCount)) & 31]
    }
    return out
}

export async function createCompanionHello(): Promise<{
    readonly pairingCode: string
    readonly companionEphemeralKeyPair: SignalKeyPair
    readonly wrappedCompanionEphemeralPub: Uint8Array
}> {
    const [codeBytes, companionEphemeralKeyPair, salt, counter] = await Promise.all([
        randomBytesAsync(5),
        X25519.generateKeyPair(),
        randomBytesAsync(32),
        randomBytesAsync(16)
    ])
    const pairingCode = bytesToCrockford(codeBytes)
    const cipher = await pbkdf2DeriveAesCtrKey(
        TEXT_ENCODER.encode(pairingCode),
        salt,
        PBKDF2_ITERATIONS
    )
    const encrypted = await aesCtrEncrypt(cipher, counter, companionEphemeralKeyPair.pubKey)

    return {
        pairingCode,
        companionEphemeralKeyPair,
        wrappedCompanionEphemeralPub: concatBytes([salt, counter, encrypted])
    }
}

export async function completeCompanionFinish(args: {
    readonly pairingCode: string
    readonly wrappedPrimaryEphemeralPub: Uint8Array
    readonly primaryIdentityPub: Uint8Array
    readonly companionEphemeralPrivKey: Uint8Array
    readonly registrationIdentityKeyPair: SignalKeyPair
}): Promise<{
    readonly wrappedKeyBundle: Uint8Array
    readonly companionIdentityPublic: Uint8Array
    readonly advSecret: Uint8Array
}> {
    if (args.wrappedPrimaryEphemeralPub.length <= 48) {
        throw new Error('invalid wrapped primary payload')
    }
    const pairingCipher = await pbkdf2DeriveAesCtrKey(
        TEXT_ENCODER.encode(args.pairingCode),
        args.wrappedPrimaryEphemeralPub.subarray(0, 32),
        PBKDF2_ITERATIONS
    )
    const primaryEphemeralPub = await aesCtrDecrypt(
        pairingCipher,
        args.wrappedPrimaryEphemeralPub.subarray(32, 48),
        args.wrappedPrimaryEphemeralPub.subarray(48)
    )
    if (primaryEphemeralPub.length === 0) {
        throw new Error('empty primary ephemeral public key')
    }

    const [sharedEphemeral, bundleSalt, bundleSecret, bundleIv] = await Promise.all([
        X25519.scalarMult(args.companionEphemeralPrivKey, primaryEphemeralPub),
        randomBytesAsync(32),
        randomBytesAsync(32),
        randomBytesAsync(12)
    ])

    const bundleEncryptionKeyRaw = await hkdf(
        sharedEphemeral,
        bundleSalt,
        WA_PAIRING_KDF_INFO.LINK_CODE_BUNDLE,
        32
    )
    const bundleEncryptionKey = await importAesGcmKey(bundleEncryptionKeyRaw, ['encrypt'])

    const plaintextBundle = concatBytes([
        args.registrationIdentityKeyPair.pubKey,
        args.primaryIdentityPub,
        bundleSecret
    ])
    const [encryptedBundle, sharedIdentity] = await Promise.all([
        aesGcmEncrypt(bundleEncryptionKey, bundleIv, plaintextBundle),
        X25519.scalarMult(args.registrationIdentityKeyPair.privKey, args.primaryIdentityPub)
    ])
    const wrappedKeyBundle = concatBytes([bundleSalt, bundleIv, encryptedBundle])
    const advMaterial = concatBytes([sharedEphemeral, sharedIdentity, bundleSecret])
    const advSecret = await hkdf(advMaterial, null, WA_PAIRING_KDF_INFO.ADV_SECRET, 32)

    return {
        wrappedKeyBundle,
        companionIdentityPublic: args.registrationIdentityKeyPair.pubKey,
        advSecret
    }
}
