import { webcrypto } from 'node:crypto'

import { X25519_PKCS8_PREFIX } from '@crypto/curves/constants'
import { pkcs8FromRawPrivate, type SignalKeyPair, type SubtleKeyPair } from '@crypto/curves/types'
import { FIELD_P } from '@crypto/math/constants'
import { bigIntToBytesLE, bytesToBigIntLE } from '@crypto/math/le'
import { mod, modInv } from '@crypto/math/mod'
import { assertByteLength, decodeBase64Url, toBytesView } from '@util/bytes'

export function clampCurvePrivateKeyInPlace(privateKey: Uint8Array): Uint8Array {
    assertByteLength(privateKey, 32, `invalid curve25519 private key length ${privateKey.length}`)
    privateKey[0] &= 248
    privateKey[31] &= 127
    privateKey[31] |= 64
    return privateKey
}

export function montgomeryToEdwardsPublic(curvePublicKey: Uint8Array, signBit: number): Uint8Array {
    assertByteLength(
        curvePublicKey,
        32,
        `invalid curve25519 public key length ${curvePublicKey.length}`
    )
    const x = bytesToBigIntLE(curvePublicKey)
    if (x === FIELD_P - 1n) {
        throw new Error('invalid curve25519 low-order public key')
    }
    const y = mod((x - 1n) * modInv(x + 1n))
    const encoded = bigIntToBytesLE(y, 32)
    encoded[31] = (encoded[31] & 0x7f) | (signBit & 0x80)
    return encoded
}

export class X25519 {
    static async generateKeyPair(): Promise<SignalKeyPair> {
        const keys = (await webcrypto.subtle.generateKey({ name: 'X25519' }, true, [
            'deriveBits'
        ])) as SubtleKeyPair
        const privateJwk = await webcrypto.subtle.exportKey('jwk', keys.privateKey)
        return {
            pubKey: decodeBase64Url(privateJwk.x, 'x25519 public key'),
            privKey: decodeBase64Url(privateJwk.d, 'x25519 private key')
        }
    }

    static async keyPairFromPrivateKey(privKey: Uint8Array): Promise<SignalKeyPair> {
        assertByteLength(privKey, 32, 'x25519 private key must be 32 bytes')
        const privateKey = await webcrypto.subtle.importKey(
            'pkcs8',
            pkcs8FromRawPrivate(X25519_PKCS8_PREFIX, privKey),
            { name: 'X25519' },
            true,
            ['deriveBits']
        )
        const privateJwk = await webcrypto.subtle.exportKey('jwk', privateKey)
        return {
            pubKey: decodeBase64Url(privateJwk.x, 'x25519 public key'),
            privKey: decodeBase64Url(privateJwk.d, 'x25519 private key')
        }
    }

    static async scalarMult(privKey: Uint8Array, pubKey: Uint8Array): Promise<Uint8Array> {
        assertByteLength(privKey, 32, 'x25519 private key must be 32 bytes')
        assertByteLength(pubKey, 32, 'x25519 public key must be 32 bytes')

        const [privateKey, publicKey] = await Promise.all([
            webcrypto.subtle.importKey(
                'pkcs8',
                pkcs8FromRawPrivate(X25519_PKCS8_PREFIX, privKey),
                { name: 'X25519' },
                false,
                ['deriveBits']
            ),
            webcrypto.subtle.importKey('raw', pubKey, { name: 'X25519' }, false, [])
        ])
        const sharedBits = await webcrypto.subtle.deriveBits(
            { name: 'X25519', public: publicKey },
            privateKey,
            256
        )
        return toBytesView(sharedBits)
    }
}
