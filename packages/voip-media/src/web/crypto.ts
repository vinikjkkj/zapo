/** SRTP and STUN primitives in plain JS: WebCrypto is async, and SRTP runs packet by packet. */

import type { WaMediaCrypto } from '../crypto/primitives.js'

import { aesCtr128 } from './aes-ctr.js'
import { hmacSha1 } from './hmac-sha1.js'

/** Constant-time equality for tags; the length is not secret, so it is compared first. */
function timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    if (left.length !== right.length) {
        return false
    }
    let difference = 0
    for (let i = 0; i < left.length; i++) {
        difference |= left[i] ^ right[i]
    }
    return difference === 0
}

/** The primitives in plain JavaScript, for a host without `node:crypto`. */
export const webCrypto: WaMediaCrypto = Object.freeze({ aesCtr128, hmacSha1, timingSafeEqual })
