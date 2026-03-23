import { Ed25519, importHmacKey, hmacSign, randomBytesAsync, sha512, toRawPubKey } from '@crypto'
import type { SignalKeyPair } from '@crypto/curves/types'
import { clampCurvePrivateKeyInPlace, montgomeryToEdwardsPublic } from '@crypto/curves/X25519'
import { encodeExtendedPoint, scalarMultBase } from '@crypto/math/edwards'
import { bytesToBigIntLE, bigIntToBytesLE } from '@crypto/math/le'
import { modGroup } from '@crypto/math/mod'
import {
    ADV_PREFIX_ACCOUNT_SIGNATURE,
    ADV_PREFIX_DEVICE_SIGNATURE,
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    ADV_PREFIX_HOSTED_DEVICE_SIGNATURE,
    SIGNAL_PREFIX_SIGNATURE_RANDOM
} from '@signal/crypto/constants'
import { assertByteLength, concatBytes } from '@util/bytes'

export {
    ADV_PREFIX_ACCOUNT_SIGNATURE,
    ADV_PREFIX_DEVICE_SIGNATURE,
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    ADV_PREFIX_HOSTED_DEVICE_SIGNATURE
} from '@signal/crypto/constants'

export async function verifySignalSignature(
    publicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array
): Promise<boolean> {
    if (signature.length !== 64) {
        return false
    }
    if ((signature[63] & 0x60) !== 0) {
        return false
    }

    const signalSignature = new Uint8Array(signature)
    const signBit = signalSignature[63] & 0x80
    signalSignature[63] &= 0x7f

    const curvePublic = toRawPubKey(publicKey)
    const edPublic = montgomeryToEdwardsPublic(curvePublic, signBit)

    return Ed25519.verify(message, signalSignature, edPublic)
}

export async function signSignalMessage(
    privateKey: Uint8Array,
    message: Uint8Array
): Promise<Uint8Array> {
    assertByteLength(privateKey, 32, `invalid curve25519 private key length ${privateKey.length}`)

    const clampedPrivateKey = clampCurvePrivateKeyInPlace(privateKey)
    const privateScalar = bytesToBigIntLE(clampedPrivateKey)
    const encodedPublic = encodeExtendedPoint(scalarMultBase(privateScalar))
    const pubKeySignBit = encodedPublic[31] & 0x80

    const randomSuffix = await randomBytesAsync(64)
    const hashInput = concatBytes([
        SIGNAL_PREFIX_SIGNATURE_RANDOM,
        clampedPrivateKey,
        message,
        randomSuffix
    ])
    const r = modGroup(bytesToBigIntLE(await sha512(hashInput)))
    const encodedR = encodeExtendedPoint(scalarMultBase(r))

    const hInput = concatBytes([encodedR, encodedPublic, message])
    const h = modGroup(bytesToBigIntLE(await sha512(hInput)))
    const s = modGroup(r + h * privateScalar)

    const encodedS = bigIntToBytesLE(s, 32)
    encodedS[31] = (encodedS[31] & 0x7f) | pubKeySignBit
    return concatBytes([encodedR, encodedS])
}

export async function verifyDeviceIdentityAccountSignature(
    details: Uint8Array,
    accountSignature: Uint8Array,
    identityPublicKey: Uint8Array,
    accountSignatureKey: Uint8Array,
    isHosted = false
): Promise<boolean> {
    const prefix = isHosted ? ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE : ADV_PREFIX_ACCOUNT_SIGNATURE
    const message = concatBytes([prefix, details, identityPublicKey])
    return verifySignalSignature(accountSignatureKey, message, accountSignature)
}

export async function generateDeviceSignature(
    details: Uint8Array,
    identityKeyPair: SignalKeyPair,
    accountSignatureKey: Uint8Array,
    isHosted = false
): Promise<Uint8Array> {
    const prefix = isHosted ? ADV_PREFIX_HOSTED_DEVICE_SIGNATURE : ADV_PREFIX_DEVICE_SIGNATURE
    const message = concatBytes([prefix, details, identityKeyPair.pubKey, accountSignatureKey])
    return signSignalMessage(identityKeyPair.privKey, message)
}

export async function computeAdvIdentityHmac(
    secretKey: Uint8Array,
    details: Uint8Array
): Promise<Uint8Array> {
    const key = await importHmacKey(secretKey)
    return hmacSign(key, details)
}
