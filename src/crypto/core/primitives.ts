/**
 * Low-level crypto primitives using WebCrypto API
 */

import { createHash, webcrypto } from 'node:crypto'

import { EMPTY_BYTES, toBytesView } from '@util/bytes'

/**
 * Re-exported CryptoKey type so consumers don't need to import from 'node:crypto'
 */
export type CryptoKey = webcrypto.CryptoKey

type HashAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-512'

async function digestBytes(algorithm: HashAlgorithm, value: Uint8Array): Promise<Uint8Array> {
    return toBytesView(await webcrypto.subtle.digest(algorithm, value))
}

// ============================================
// Hash functions
// ============================================

export async function sha256(value: Uint8Array): Promise<Uint8Array> {
    return digestBytes('SHA-256', value)
}

export async function sha1(value: Uint8Array): Promise<Uint8Array> {
    return digestBytes('SHA-1', value)
}

export async function sha512(value: Uint8Array): Promise<Uint8Array> {
    return digestBytes('SHA-512', value)
}

export function md5Bytes(input: string | Uint8Array): Uint8Array {
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
    return toBytesView(
        await webcrypto.subtle.encrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: aad },
            key,
            plaintext
        )
    )
}

export async function aesGcmDecrypt(
    key: webcrypto.CryptoKey,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    aad: Uint8Array = EMPTY_BYTES
): Promise<Uint8Array> {
    return toBytesView(
        await webcrypto.subtle.decrypt(
            { name: 'AES-GCM', iv: nonce, additionalData: aad },
            key,
            ciphertext
        )
    )
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
    return toBytesView(await webcrypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, plaintext))
}

export async function aesCbcDecrypt(
    key: webcrypto.CryptoKey,
    iv: Uint8Array,
    ciphertext: Uint8Array
): Promise<Uint8Array> {
    return toBytesView(await webcrypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, ciphertext))
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
// PBKDF2 → AES-CTR (for pairing code crypto)
// ============================================

export async function pbkdf2DeriveAesCtrKey(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number
): Promise<CryptoKey> {
    const imported = await webcrypto.subtle.importKey('raw', password, { name: 'PBKDF2' }, false, [
        'deriveKey'
    ])
    return webcrypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            hash: 'SHA-256',
            salt,
            iterations
        },
        imported,
        {
            name: 'AES-CTR',
            length: 256
        },
        false,
        ['encrypt', 'decrypt']
    )
}

// ============================================
// AES-CTR (for pairing code crypto)
// ============================================

export async function aesCtrEncrypt(
    key: CryptoKey,
    counter: Uint8Array,
    plaintext: Uint8Array
): Promise<Uint8Array> {
    return toBytesView(
        await webcrypto.subtle.encrypt({ name: 'AES-CTR', counter, length: 64 }, key, plaintext)
    )
}

export async function aesCtrDecrypt(
    key: CryptoKey,
    counter: Uint8Array,
    ciphertext: Uint8Array
): Promise<Uint8Array> {
    return toBytesView(
        await webcrypto.subtle.decrypt({ name: 'AES-CTR', counter, length: 64 }, key, ciphertext)
    )
}
