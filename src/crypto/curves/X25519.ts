import { webcrypto } from 'node:crypto'

import { toBytesView } from '../../util/bytes'
import { assert32, decodeBase64Url } from '../core/encoding'
import { bigIntToBytesLE, bytesToBigIntLE } from '../math/le'
import { mod, modInv } from '../math/mod'

import { CURVE_P, X25519_PKCS8_PREFIX } from './constants'
import type { SignalKeyPair } from './types'

type SubtleKeyPair = {
    privateKey: webcrypto.CryptoKey
    publicKey: webcrypto.CryptoKey
}

function pkcs8FromRawPrivate(raw: Uint8Array): Uint8Array {
    const out = new Uint8Array(X25519_PKCS8_PREFIX.length + raw.length)
    out.set(X25519_PKCS8_PREFIX, 0)
    out.set(raw, X25519_PKCS8_PREFIX.length)
    return out
}

export function rawCurvePublicKey(publicKey: Uint8Array): Uint8Array {
    if (publicKey.length === 32) {
        return publicKey
    }
    if (publicKey.length === 33 && publicKey[0] === 5) {
        return publicKey.subarray(1)
    }
    throw new Error(`invalid curve25519 public key length ${publicKey.length}`)
}

export function clampCurvePrivateKey(privateKey: Uint8Array): Uint8Array {
    if (privateKey.length !== 32) {
        throw new Error(`invalid curve25519 private key length ${privateKey.length}`)
    }
    privateKey[0] &= 248
    privateKey[31] &= 127
    privateKey[31] |= 64
    return privateKey
}

export function montgomeryToEdwardsPublic(curvePublicKey: Uint8Array, signBit: number): Uint8Array {
    const x = bytesToBigIntLE(curvePublicKey)
    const y = mod((x - 1n) * modInv(x + 1n))
    const encoded = bigIntToBytesLE(y, 32)
    encoded[31] = (encoded[31] & 0x7f) | (signBit & 0x80)
    return encoded
}

export function montgomeryToEdwardsPubKey(montgomeryX: Uint8Array, signBit: number): Uint8Array {
    if (montgomeryX.length !== 32) {
        throw new Error('invalid montgomery public key length')
    }
    const u = bytesToBigIntLE(montgomeryX) % CURVE_P
    const numerator = (u - 1n + CURVE_P) % CURVE_P
    const denominator = (u + 1n) % CURVE_P
    const y = (numerator * modInv(denominator, CURVE_P)) % CURVE_P
    const out = bigIntToBytesLE(y, 32)
    out[31] = (out[31] & 0x7f) | signBit
    return out
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
        assert32(privKey, 'x25519 private key')
        const privateKey = await webcrypto.subtle.importKey(
            'pkcs8',
            pkcs8FromRawPrivate(privKey),
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
        assert32(privKey, 'x25519 private key')
        assert32(pubKey, 'x25519 public key')

        const privateKey = await webcrypto.subtle.importKey(
            'pkcs8',
            pkcs8FromRawPrivate(privKey),
            { name: 'X25519' },
            false,
            ['deriveBits']
        )
        const publicKey = await webcrypto.subtle.importKey(
            'raw',
            pubKey,
            { name: 'X25519' },
            false,
            []
        )
        const sharedBits = await webcrypto.subtle.deriveBits(
            { name: 'X25519', public: publicKey },
            privateKey,
            256
        )
        return toBytesView(sharedBits)
    }
}
