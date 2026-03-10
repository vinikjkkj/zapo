/**
 * Low-level crypto primitives using WebCrypto API
 */

import { createHash, webcrypto } from 'node:crypto'

import { EMPTY_BYTES } from '../../transport/noise/constants'
import { toBytesView } from '../../util/bytes'

// ============================================
// Hash functions
// ============================================

export async function sha256(value: Uint8Array): Promise<Uint8Array> {
    return toBytesView(await webcrypto.subtle.digest('SHA-256', value))
}

export async function sha512(value: Uint8Array): Promise<Uint8Array> {
    return toBytesView(await webcrypto.subtle.digest('SHA-512', value))
}

export function md5Bytes(input: string): Uint8Array {
    return toBytesView(createHash('md5').update(input).digest())
}

// ============================================
// AES-GCM (for Noise protocol)
// ============================================

export async function importAesGcmKey(
    raw: Uint8Array,
    usages: ('encrypt' | 'decrypt')[]
): Promise<webcrypto.CryptoKey> {
    return webcrypto.subtle.importKey('raw', raw, 'AES-GCM', false, usages)
}

export async function aesGcmEncrypt(
    key: webcrypto.CryptoKey,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array = EMPTY_BYTES
): Promise<Uint8Array> {
    const result = await webcrypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad },
        key,
        plaintext
    )
    return toBytesView(result)
}

export async function aesGcmDecrypt(
    key: webcrypto.CryptoKey,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    aad: Uint8Array = EMPTY_BYTES
): Promise<Uint8Array> {
    const result = await webcrypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce, additionalData: aad },
        key,
        ciphertext
    )
    return toBytesView(result)
}

// ============================================
// AES-CBC (for Signal protocol)
// ============================================

export async function importAesCbcKey(keyBytes: Uint8Array): Promise<webcrypto.CryptoKey> {
    return webcrypto.subtle.importKey('raw', keyBytes, { name: 'AES-CBC', length: 256 }, false, [
        'encrypt',
        'decrypt'
    ])
}

export async function aesCbcEncrypt(
    key: webcrypto.CryptoKey,
    iv: Uint8Array,
    plaintext: Uint8Array
): Promise<Uint8Array> {
    const result = await webcrypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plaintext)
    return toBytesView(result)
}

export async function aesCbcDecrypt(
    key: webcrypto.CryptoKey,
    iv: Uint8Array,
    ciphertext: Uint8Array
): Promise<Uint8Array> {
    const result = await webcrypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext)
    return toBytesView(result)
}

// ============================================
// HMAC-SHA256 (for Signal protocol)
// ============================================

export async function importHmacKey(keyBytes: Uint8Array): Promise<webcrypto.CryptoKey> {
    return webcrypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
        'sign'
    ])
}

export async function importHmacSha512Key(keyBytes: Uint8Array): Promise<webcrypto.CryptoKey> {
    return webcrypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-512' }, false, [
        'sign'
    ])
}

export async function hmacSign(key: webcrypto.CryptoKey, data: Uint8Array): Promise<Uint8Array> {
    return toBytesView(await webcrypto.subtle.sign('HMAC', key, data))
}

// ============================================
// HKDF variants
// ============================================

/**
 * HKDF-SHA256 that outputs exactly 64 bytes (two 32-byte keys)
 * Used in Noise protocol for key splitting
 */
export async function hkdfSplit64(
    salt: Uint8Array,
    inputKeyMaterial: Uint8Array
): Promise<readonly [Uint8Array, Uint8Array]> {
    const key = await webcrypto.subtle.importKey('raw', inputKeyMaterial, 'HKDF', false, [
        'deriveBits'
    ])
    const bits = await webcrypto.subtle.deriveBits(
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt,
            info: EMPTY_BYTES
        },
        key,
        64 * 8
    )
    const output = toBytesView(bits)
    return [output.subarray(0, 32), output.subarray(32, 64)]
}
