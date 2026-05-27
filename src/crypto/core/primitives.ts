import {
    createCipheriv,
    createDecipheriv,
    createHash,
    createHmac,
    type KeyObject,
    pbkdf2
} from 'node:crypto'
import { promisify } from 'node:util'

import { concatBytes, EMPTY_BYTES, toBytesView } from '@util/bytes'

const AES_GCM_TAG_LENGTH = 16

const pbkdf2Async = promisify(pbkdf2)

export type HashInput = Uint8Array | readonly Uint8Array[]

type Digestable = ReturnType<typeof createHash> | ReturnType<typeof createHmac>

function feed<T extends Digestable>(target: T, input: HashInput): T {
    if (Array.isArray(input)) {
        for (let i = 0; i < input.length; i += 1) {
            target.update(input[i])
        }
    } else {
        target.update(input as Uint8Array)
    }
    return target
}

/** Computes the SHA-1 digest of `value`. Accepts a single chunk or array of chunks. */
export function sha1(value: HashInput): Uint8Array {
    return toBytesView(feed(createHash('sha1'), value).digest())
}

/** Computes the SHA-256 digest of `value`. */
export function sha256(value: HashInput): Uint8Array {
    return toBytesView(feed(createHash('sha256'), value).digest())
}

/** Computes the SHA-512 digest of `value`. */
export function sha512(value: HashInput): Uint8Array {
    return toBytesView(feed(createHash('sha512'), value).digest())
}

/** Computes the MD5 digest of `input`, accepting a string or raw chunks. */
export function md5Bytes(input: string | HashInput): Uint8Array {
    const hash = createHash('md5')
    if (typeof input === 'string') {
        hash.update(input)
    } else {
        feed(hash, input)
    }
    return toBytesView(hash.digest())
}

export type AesKey = Uint8Array | KeyObject

/**
 * AES-256-GCM encrypt. The 16-byte auth tag is appended to the ciphertext.
 * Pass `aad` when binding the ciphertext to associated data.
 */
export function aesGcmEncrypt(
    key: AesKey,
    nonce: Uint8Array,
    plaintext: Uint8Array,
    aad: Uint8Array = EMPTY_BYTES
): Uint8Array {
    const cipher = createCipheriv('aes-256-gcm', key, nonce)
    if (aad.length > 0) {
        cipher.setAAD(aad)
    }
    const head = cipher.update(plaintext)
    const tail = cipher.final()
    const tag = cipher.getAuthTag()
    return concatBytes([head, tail, tag])
}

/**
 * AES-256-GCM decrypt. Expects the 16-byte auth tag appended to the
 * ciphertext (matching {@link aesGcmEncrypt}'s layout). Throws on auth failure.
 */
export function aesGcmDecrypt(
    key: AesKey,
    nonce: Uint8Array,
    ciphertext: Uint8Array,
    aad: Uint8Array = EMPTY_BYTES
): Uint8Array {
    const tagOffset = ciphertext.length - AES_GCM_TAG_LENGTH
    const tag = ciphertext.subarray(tagOffset)
    const ct = ciphertext.subarray(0, tagOffset)
    const decipher = createDecipheriv('aes-256-gcm', key, nonce)
    if (aad.length > 0) {
        decipher.setAAD(aad)
    }
    decipher.setAuthTag(tag)
    const head = decipher.update(ct)
    const tail = decipher.final()
    if (tail.length === 0) {
        return toBytesView(head)
    }
    return concatBytes([head, tail])
}

/** AES-256-CBC encrypt with PKCS#7 padding (default Node behavior). */
export function aesCbcEncrypt(key: Uint8Array, iv: Uint8Array, plaintext: Uint8Array): Uint8Array {
    const cipher = createCipheriv('aes-256-cbc', key, iv)
    const head = cipher.update(plaintext)
    const tail = cipher.final()
    if (tail.length === 0) {
        return toBytesView(head)
    }
    return concatBytes([head, tail])
}

/** AES-256-CBC decrypt with PKCS#7 padding. */
export function aesCbcDecrypt(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
    const decipher = createDecipheriv('aes-256-cbc', key, iv)
    const head = decipher.update(ciphertext)
    const tail = decipher.final()
    if (tail.length === 0) {
        return toBytesView(head)
    }
    return concatBytes([head, tail])
}

/** AES-256-CTR encrypt with the given 16-byte counter. */
export function aesCtrEncrypt(
    key: Uint8Array,
    counter: Uint8Array,
    plaintext: Uint8Array
): Uint8Array {
    const cipher = createCipheriv('aes-256-ctr', key, counter)
    const head = cipher.update(plaintext)
    const tail = cipher.final()
    if (tail.length === 0) {
        return toBytesView(head)
    }
    return concatBytes([head, tail])
}

/** AES-256-CTR decrypt with the given 16-byte counter. */
export function aesCtrDecrypt(
    key: Uint8Array,
    counter: Uint8Array,
    ciphertext: Uint8Array
): Uint8Array {
    const decipher = createDecipheriv('aes-256-ctr', key, counter)
    const head = decipher.update(ciphertext)
    const tail = decipher.final()
    if (tail.length === 0) {
        return toBytesView(head)
    }
    return concatBytes([head, tail])
}

/** Computes the HMAC-SHA-256 MAC of `data` keyed by `key`. */
export function hmacSha256Sign(key: Uint8Array, data: HashInput): Uint8Array {
    return toBytesView(feed(createHmac('sha256', key), data).digest())
}

/** Computes the HMAC-SHA-512 MAC of `data` keyed by `key`. */
export function hmacSha512Sign(key: Uint8Array, data: HashInput): Uint8Array {
    return toBytesView(feed(createHmac('sha512', key), data).digest())
}

/** PBKDF2 over HMAC-SHA-256 – derives `length` bytes from `password` + `salt`. */
export async function pbkdf2Sha256(
    password: Uint8Array,
    salt: Uint8Array,
    iterations: number,
    length: number
): Promise<Uint8Array> {
    return toBytesView(await pbkdf2Async(password, salt, iterations, length, 'sha256'))
}
