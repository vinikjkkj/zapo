/** SHA-1 and HMAC-SHA1 in plain JS with per-key cached pad states. */

import { cachedState, type KeyedState, readWord } from './keyed-state.js'

const SHA1_BLOCK_LENGTH = 64
const SHA1_DIGEST_LENGTH = 20
const HMAC_INNER_PAD = 0x36
const HMAC_OUTER_PAD = 0x5c

/** SHA-1 over one shared scratch state; every caller runs it to completion synchronously. */
class Sha1 {
    private readonly state = new Uint32Array(5)
    private readonly block = new Uint8Array(SHA1_BLOCK_LENGTH)
    private readonly schedule = new Uint32Array(80)
    private blockLength = 0
    private totalLength = 0

    reset(): void {
        this.state[0] = 0x67452301
        this.state[1] = 0xefcdab89
        this.state[2] = 0x98badcfe
        this.state[3] = 0x10325476
        this.state[4] = 0xc3d2e1f0
        this.blockLength = 0
        this.totalLength = 0
    }

    /** Resumes from a chaining state saved at `from` right after one whole block. */
    resumeAfterBlock(saved: Uint32Array, from: number): void {
        for (let i = 0; i < 5; i++) {
            this.state[i] = saved[from + i]
        }
        this.blockLength = 0
        this.totalLength = SHA1_BLOCK_LENGTH
    }

    saveState(out: Uint32Array, offset: number): void {
        for (let i = 0; i < 5; i++) {
            out[offset + i] = this.state[i]
        }
    }

    update(data: Uint8Array): void {
        this.totalLength += data.length
        let offset = 0
        while (offset < data.length) {
            const take = Math.min(SHA1_BLOCK_LENGTH - this.blockLength, data.length - offset)
            this.block.set(data.subarray(offset, offset + take), this.blockLength)
            this.blockLength += take
            offset += take
            if (this.blockLength === SHA1_BLOCK_LENGTH) {
                this.compress()
                this.blockLength = 0
            }
        }
    }

    digest(output: Uint8Array = new Uint8Array(SHA1_DIGEST_LENGTH)): Uint8Array {
        const bitLength = this.totalLength * 8
        this.block[this.blockLength++] = 0x80
        if (this.blockLength > SHA1_BLOCK_LENGTH - 8) {
            this.block.fill(0, this.blockLength)
            this.compress()
            this.blockLength = 0
        }
        this.block.fill(0, this.blockLength, SHA1_BLOCK_LENGTH - 8)
        const high = Math.floor(bitLength / 0x1_0000_0000)
        const low = bitLength >>> 0
        for (let i = 0; i < 4; i++) {
            this.block[56 + i] = (high >>> (24 - i * 8)) & 0xff
            this.block[60 + i] = (low >>> (24 - i * 8)) & 0xff
        }
        this.compress()

        for (let i = 0; i < 5; i++) {
            const word = this.state[i]
            output[i * 4] = word >>> 24
            output[i * 4 + 1] = (word >>> 16) & 0xff
            output[i * 4 + 2] = (word >>> 8) & 0xff
            output[i * 4 + 3] = word & 0xff
        }
        return output
    }

    private compress(): void {
        const w = this.schedule
        for (let i = 0; i < 16; i++) {
            w[i] = readWord(this.block, i * 4)
        }
        for (let i = 16; i < 80; i++) {
            const mixed = w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16]
            w[i] = (mixed << 1) | (mixed >>> 31)
        }

        let a = this.state[0]
        let b = this.state[1]
        let c = this.state[2]
        let d = this.state[3]
        let e = this.state[4]

        for (let i = 0; i < 80; i++) {
            let mix: number
            let constant: number
            if (i < 20) {
                mix = (b & c) | (~b & d)
                constant = 0x5a827999
            } else if (i < 40) {
                mix = b ^ c ^ d
                constant = 0x6ed9eba1
            } else if (i < 60) {
                mix = (b & c) | (b & d) | (c & d)
                constant = 0x8f1bbcdc
            } else {
                mix = b ^ c ^ d
                constant = 0xca62c1d6
            }
            const next = (((a << 5) | (a >>> 27)) + mix + e + constant + w[i]) >>> 0
            e = d
            d = c
            c = ((b << 30) | (b >>> 2)) >>> 0
            b = a
            a = next
        }

        this.state[0] = (this.state[0] + a) >>> 0
        this.state[1] = (this.state[1] + b) >>> 0
        this.state[2] = (this.state[2] + c) >>> 0
        this.state[3] = (this.state[3] + d) >>> 0
        this.state[4] = (this.state[4] + e) >>> 0
    }
}

const sha1 = new Sha1()
const paddedKey = new Uint8Array(SHA1_BLOCK_LENGTH)
const keyPad = new Uint8Array(SHA1_BLOCK_LENGTH)
const innerDigest = new Uint8Array(SHA1_DIGEST_LENGTH)
const SHA1_STATE_WORDS = 5
const hmacPads = new WeakMap<Uint8Array, KeyedState>()

function applyPad(pad: number): Uint8Array {
    for (let i = 0; i < SHA1_BLOCK_LENGTH; i++) {
        keyPad[i] = paddedKey[i] ^ pad
    }
    return keyPad
}

/** Hashes the inner and outer pads once: words 0-4 are the inner state, 5-9 the outer. */
function buildHmacPads(key: Uint8Array, pads: Uint32Array): void {
    paddedKey.fill(0)
    if (key.length > SHA1_BLOCK_LENGTH) {
        sha1.reset()
        sha1.update(key)
        sha1.digest(paddedKey)
    } else {
        paddedKey.set(key)
    }
    sha1.reset()
    sha1.update(applyPad(HMAC_INNER_PAD))
    sha1.saveState(pads, 0)
    sha1.reset()
    sha1.update(applyPad(HMAC_OUTER_PAD))
    sha1.saveState(pads, SHA1_STATE_WORDS)
}

export function hmacSha1(key: Uint8Array, ...parts: readonly Uint8Array[]): Uint8Array {
    const pads = cachedState(hmacPads, key, buildHmacPads, SHA1_STATE_WORDS * 2)
    sha1.resumeAfterBlock(pads, 0)
    for (const part of parts) {
        sha1.update(part)
    }
    sha1.digest(innerDigest)

    sha1.resumeAfterBlock(pads, SHA1_STATE_WORDS)
    sha1.update(innerDigest)
    return sha1.digest()
}
