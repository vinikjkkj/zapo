/**
 * SRTP and STUN primitives supplied by the host (`node:crypto` in Node, plain JS in a
 * browser). Synchronous, because SRTP runs packet by packet.
 */
export interface WaMediaCrypto {
    /** AES-128 in counter mode, the counter being the whole 16-byte `iv` as one big-endian integer. */
    aesCtr128(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array
    /** HMAC-SHA1 over the concatenation of `parts`. */
    hmacSha1(key: Uint8Array, ...parts: readonly Uint8Array[]): Uint8Array
    /** Constant-time equality for authentication tags; a length mismatch is `false`. */
    timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean
}
