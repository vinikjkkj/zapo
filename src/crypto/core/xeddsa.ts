import { sha512 } from '@crypto/core/primitives'
import { randomBytesAsync } from '@crypto/core/random'
import { Ed25519 } from '@crypto/curves/Ed25519'
import { clampCurvePrivateKeyInPlace, montgomeryToEdwardsPublic } from '@crypto/curves/X25519'
import { encodeExtendedPoint, scalarMultBase } from '@crypto/math/edwards'
import { bigIntToBytesLE, bytesToBigIntLE } from '@crypto/math/le'
import { modGroup } from '@crypto/math/mod'
import { assertByteLength, concatBytes } from '@util/bytes'

const PREFIX_SIGNATURE_RANDOM = new Uint8Array([
    0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff
])

export async function xeddsaVerify(
    curvePublicKey: Uint8Array,
    message: Uint8Array,
    signature: Uint8Array
): Promise<boolean> {
    if (signature.length !== 64) {
        return false
    }
    if ((signature[63] & 0x60) !== 0) {
        return false
    }

    const lastByteIndex = 63
    const originalLastByte = signature[lastByteIndex]
    const signBit = originalLastByte & 0x80
    signature[lastByteIndex] = originalLastByte & 0x7f

    const edPublic = montgomeryToEdwardsPublic(curvePublicKey, signBit)
    try {
        return await Ed25519.verify(message, signature, edPublic)
    } finally {
        signature[lastByteIndex] = originalLastByte
    }
}

export async function xeddsaSign(privateKey: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
    assertByteLength(privateKey, 32, `invalid curve25519 private key length ${privateKey.length}`)

    const clampedPrivateKey = clampCurvePrivateKeyInPlace(privateKey)
    const privateScalar = bytesToBigIntLE(clampedPrivateKey)
    const encodedPublic = encodeExtendedPoint(scalarMultBase(privateScalar))
    const pubKeySignBit = encodedPublic[31] & 0x80

    const randomSuffix = await randomBytesAsync(64)
    const r = modGroup(
        bytesToBigIntLE(sha512([PREFIX_SIGNATURE_RANDOM, clampedPrivateKey, message, randomSuffix]))
    )
    const encodedR = encodeExtendedPoint(scalarMultBase(r))

    const h = modGroup(bytesToBigIntLE(sha512([encodedR, encodedPublic, message])))
    const s = modGroup(r + h * privateScalar)

    const encodedS = bigIntToBytesLE(s, 32)
    encodedS[31] = (encodedS[31] & 0x7f) | pubKeySignBit
    return concatBytes([encodedR, encodedS])
}
