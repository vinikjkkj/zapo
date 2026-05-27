/**
 * Writes a 32-bit big-endian `counter` into the last 4 bytes of a 12-byte
 * AES-GCM nonce buffer. The first 8 bytes are left untouched so callers can
 * reuse a per-instance scratch buffer in hot paths.
 */
export function writeNonceCounter(out: Uint8Array, counter: number): void {
    if (out.length < 12) {
        throw new Error(`nonce buffer must be at least 12 bytes, got ${out.length}`)
    }
    if (counter > 0xffffffff) {
        throw new Error('nonce counter overflow: exceeds uint32 range')
    }
    out[8] = (counter >>> 24) & 0xff
    out[9] = (counter >>> 16) & 0xff
    out[10] = (counter >>> 8) & 0xff
    out[11] = counter & 0xff
}
