import { createCipheriv, createHmac, timingSafeEqual as nodeTimingSafeEqual } from 'node:crypto'

import { toBytesView } from '../bytes.js'
import type { WaMediaCrypto } from '../crypto/primitives.js'

function aesCtr128(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
    const cipher = createCipheriv('aes-128-ctr', key, iv)
    const output = toBytesView(cipher.update(data))
    cipher.final()
    return output
}

function hmacSha1(key: Uint8Array, ...parts: readonly Uint8Array[]): Uint8Array {
    const hmac = createHmac('sha1', key)
    for (const part of parts) {
        hmac.update(part)
    }
    return toBytesView(hmac.digest())
}

/**
 * The native comparison throws on a length mismatch instead of answering it,
 * and the length of a tag is not secret, so it is checked first.
 */
function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) {
        return false
    }
    return nodeTimingSafeEqual(left, right)
}

/** The primitives on `node:crypto`. */
export const nodeCrypto: WaMediaCrypto = Object.freeze({ aesCtr128, hmacSha1, timingSafeEqual })
