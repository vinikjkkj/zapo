import { createPrivateKey, createPublicKey, diffieHellman, generateKeyPair } from 'node:crypto'
import { promisify } from 'node:util'

const generateKeyPairAsync = promisify(generateKeyPair)

import { X25519_PKCS8_PREFIX, X25519_SPKI_PREFIX } from '@crypto/curves/constants'
import { pkcs8FromRawPrivate, type SignalKeyPair } from '@crypto/curves/types'
import { FE_ONE } from '@crypto/math/constants'
import { fe, feAdd, feFromBytes, feInv, feMul, fePack, feSub } from '@crypto/math/fe'
import { assertByteLength, concatBytes, decodeBase64Url, toBytesView } from '@util/bytes'

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

function x25519PrivateKeyObject(privKey: Uint8Array) {
    return createPrivateKey({
        key: pkcs8FromRawPrivate(X25519_PKCS8_PREFIX, privKey) as Buffer,
        format: 'der',
        type: 'pkcs8'
    })
}

function x25519PublicKeyObject(pubKey: Uint8Array) {
    return createPublicKey({
        key: concatBytes([X25519_SPKI_PREFIX, pubKey]) as Buffer,
        format: 'der',
        type: 'spki'
    })
}

export class X25519 {
    static async generateKeyPair(): Promise<SignalKeyPair> {
        const { privateKey } = await generateKeyPairAsync('x25519')
        const jwk = privateKey.export({ format: 'jwk' })
        return {
            pubKey: decodeBase64Url(jwk.x, 'x25519 public key'),
            privKey: decodeBase64Url(jwk.d, 'x25519 private key')
        }
    }

    static async keyPairFromPrivateKey(privKey: Uint8Array): Promise<SignalKeyPair> {
        assertByteLength(privKey, 32, 'x25519 private key must be 32 bytes')
        const jwk = x25519PrivateKeyObject(privKey).export({ format: 'jwk' })
        return {
            pubKey: decodeBase64Url(jwk.x, 'x25519 public key'),
            privKey
        }
    }

    static async scalarMult(privKey: Uint8Array, pubKey: Uint8Array): Promise<Uint8Array> {
        assertByteLength(privKey, 32, 'x25519 private key must be 32 bytes')
        assertByteLength(pubKey, 32, 'x25519 public key must be 32 bytes')
        return Promise.resolve(
            toBytesView(
                diffieHellman({
                    privateKey: x25519PrivateKeyObject(privKey),
                    publicKey: x25519PublicKeyObject(pubKey)
                })
            )
        )
    }
}
