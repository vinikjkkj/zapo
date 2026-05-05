export function buildNonce(counter: number): Uint8Array {
    const nonce = new Uint8Array(12)
    writeNonceCounter(nonce, counter)
    return nonce
}

export function writeNonceCounter(out: Uint8Array, counter: number): void {
    if (counter > 0xffffffff) {
        throw new Error('nonce counter overflow: exceeds uint32 range')
    }
    out[8] = (counter >>> 24) & 0xff
    out[9] = (counter >>> 16) & 0xff
    out[10] = (counter >>> 8) & 0xff
    out[11] = counter & 0xff
}
