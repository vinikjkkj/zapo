import { webcrypto } from 'node:crypto'

import { importHmacKey, hmacSign, randomBytesAsync, sha512 } from '../../crypto'
import type { SignalKeyPair } from '../../crypto/curves/types'
import {
    clampCurvePrivateKey,
    montgomeryToEdwardsPublic,
    rawCurvePublicKey
} from '../../crypto/curves/X25519'
import { encodeExtendedPoint, scalarMultBase } from '../../crypto/math/edwards'
import { bytesToBigIntLE, bigIntToBytesLE } from '../../crypto/math/le'
import { modGroup } from '../../crypto/math/mod'
import { concatBytes } from '../../util/bytes'

import {
    ADV_PREFIX_ACCOUNT_SIGNATURE,
    ADV_PREFIX_DEVICE_SIGNATURE,
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    ADV_PREFIX_HOSTED_DEVICE_SIGNATURE,
    SIGNAL_PREFIX_SIGNATURE_RANDOM
} from './constants'

export {
    ADV_PREFIX_ACCOUNT_SIGNATURE,
    ADV_PREFIX_DEVICE_SIGNATURE,
    ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE,
    ADV_PREFIX_HOSTED_DEVICE_SIGNATURE
} from './constants'

export class WaAdvSignature {
    static async verifySignalSignature(
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

        const curvePublic = rawCurvePublicKey(publicKey)
        const edPublic = montgomeryToEdwardsPublic(curvePublic, signBit)

        const cryptoKey = await webcrypto.subtle.importKey(
            'raw',
            edPublic,
            { name: 'Ed25519' },
            false,
            ['verify']
        )
        return webcrypto.subtle.verify('Ed25519', cryptoKey, signalSignature, message)
    }

    static async signSignalMessage(
        privateKey: Uint8Array,
        message: Uint8Array
    ): Promise<Uint8Array> {
        if (privateKey.length !== 32) {
            throw new Error(`invalid curve25519 private key length ${privateKey.length}`)
        }

        const clampedPrivateKey = clampCurvePrivateKey(privateKey)
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

    static async verifyDeviceIdentityAccountSignature(
        details: Uint8Array,
        accountSignature: Uint8Array,
        identityPublicKey: Uint8Array,
        accountSignatureKey: Uint8Array,
        isHosted = false
    ): Promise<boolean> {
        const prefix = isHosted ? ADV_PREFIX_HOSTED_ACCOUNT_SIGNATURE : ADV_PREFIX_ACCOUNT_SIGNATURE
        const message = concatBytes([prefix, details, identityPublicKey])
        return WaAdvSignature.verifySignalSignature(accountSignatureKey, message, accountSignature)
    }

    static async generateDeviceSignature(
        details: Uint8Array,
        identityKeyPair: SignalKeyPair,
        accountSignatureKey: Uint8Array,
        isHosted = false
    ): Promise<Uint8Array> {
        const prefix = isHosted ? ADV_PREFIX_HOSTED_DEVICE_SIGNATURE : ADV_PREFIX_DEVICE_SIGNATURE
        const message = concatBytes([prefix, details, identityKeyPair.pubKey, accountSignatureKey])
        return WaAdvSignature.signSignalMessage(identityKeyPair.privKey, message)
    }

    static async computeAdvIdentityHmac(
        secretKey: Uint8Array,
        details: Uint8Array
    ): Promise<Uint8Array> {
        const key = await importHmacKey(secretKey)
        return hmacSign(key, details)
    }
}
