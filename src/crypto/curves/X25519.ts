import { webcrypto } from 'node:crypto'

import { X25519_PKCS8_PREFIX } from '@crypto/curves/constants'
import { pkcs8FromRawPrivate, type SignalKeyPair, type SubtleKeyPair } from '@crypto/curves/types'
import { FE_ONE } from '@crypto/math/constants'
import { fe, feAdd, feFromBytes, feInv, feMul, fePack, feSub } from '@crypto/math/fe'
import { assertByteLength, decodeBase64Url, toBytesView } from '@util/bytes'

const privKeyCache = new WeakMap<Uint8Array, webcrypto.CryptoKey>()
const pubKeyCache = new WeakMap<Uint8Array, webcrypto.CryptoKey>()

async function cachedImportPrivateKey(raw: Uint8Array): Promise<webcrypto.CryptoKey> {
    const cached = privKeyCache.get(raw)
    if (cached) return cached
    const key = await webcrypto.subtle.importKey(
        'pkcs8',
        pkcs8FromRawPrivate(X25519_PKCS8_PREFIX, raw),
        { name: 'X25519' },
        false,
        ['deriveBits']
    )
    privKeyCache.set(raw, key)
    return key
}

async function cachedImportPublicKey(raw: Uint8Array): Promise<webcrypto.CryptoKey> {
    const cached = pubKeyCache.get(raw)
    if (cached) return cached
    const key = await webcrypto.subtle.importKey('raw', raw, { name: 'X25519' }, false, [])
    pubKeyCache.set(raw, key)
    return key
}

// Pre-allocated temps for montgomeryToEdwardsPublic (safe: single-threaded)
const _mx = fe()
const _m1 = fe()
const _m2 = fe()
const _m3 = fe()

// p-1 = 2^255-20 in LE bytes: 0xEC, 0xFF×30, 0x7F
// Mask bit 255 before comparing (non-canonical inputs may have it set)
function isFieldPMinus1(b: Uint8Array): boolean {
    if (b[0] !== 0xec || (b[31] & 0x7f) !== 0x7f) return false
    for (let i = 1; i < 31; i++) if (b[i] !== 0xff) return false
    return true
}

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
    if (isFieldPMinus1(curvePublicKey)) {
        throw new Error('invalid curve25519 low-order public key')
    }
    feFromBytes(_mx, curvePublicKey)
    feSub(_m1, _mx, FE_ONE)
    feAdd(_m2, _mx, FE_ONE)
    feInv(_m3, _m2)
    feMul(_m1, _m1, _m3)
    const encoded = new Uint8Array(32)
    fePack(encoded, _m1)
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
        // This needs extractable=true for exportKey, so it can't use the
        // non-extractable cache. Import directly.
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
            cachedImportPrivateKey(privKey),
            cachedImportPublicKey(pubKey)
        ])
        const sharedBits = await webcrypto.subtle.deriveBits(
            { name: 'X25519', public: publicKey },
            privateKey,
            256
        )
        return toBytesView(sharedBits)
    }
}
