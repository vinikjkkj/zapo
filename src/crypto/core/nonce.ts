/**
 * Builds a 12-byte nonce for AES-GCM encryption with counter in the last 4 bytes.
 * Allocates a new buffer per call because concurrent Noise encrypt/decrypt operations
 * may hold references to different nonces simultaneously.
 * Throws if counter exceeds uint32 range to prevent nonce reuse.
 */
export function buildNonce(counter: number): Uint8Array {
    if (counter > 0xffffffff) {
        throw new Error('nonce counter overflow: exceeds uint32 range')
    }
    const nonce = new Uint8Array(12)
    nonce[8] = (counter >>> 24) & 0xff
    nonce[9] = (counter >>> 16) & 0xff
    nonce[10] = (counter >>> 8) & 0xff
    nonce[11] = counter & 0xff
    return nonce
}
