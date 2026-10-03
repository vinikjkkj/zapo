/** SRTP and STUN primitives in plain JS: WebCrypto is async, and SRTP runs packet by packet. */

import type { WaMediaCrypto } from '../crypto/primitives.js'

const AES_BLOCK_LENGTH = 16
const AES_128_ROUNDS = 10
const AES_128_KEY_WORDS = 4
const AES_128_SCHEDULE_WORDS = AES_BLOCK_LENGTH + AES_128_ROUNDS * AES_128_KEY_WORDS

const SHA1_BLOCK_LENGTH = 64
const SHA1_DIGEST_LENGTH = 20
const HMAC_INNER_PAD = 0x36
const HMAC_OUTER_PAD = 0x5c

const SBOX = new Uint8Array(256)
const TE0 = new Uint32Array(256)
const TE1 = new Uint32Array(256)
const TE2 = new Uint32Array(256)
const TE3 = new Uint32Array(256)

function xtime(value: number): number {
    return ((value << 1) ^ (value & 0x80 ? 0x1b : 0)) & 0xff
}

function rotateByteLeft(value: number, shift: number): number {
    return ((value << shift) | (value >>> (8 - shift))) & 0xff
}

/** Builds the S-box and encryption tables from field arithmetic instead of pasted literals. */
function buildAesTables(): void {
    const exp = new Uint8Array(256)
    const log = new Uint8Array(256)
    let generator = 1
    for (let i = 0; i < 255; i++) {
        exp[i] = generator
        log[generator] = i
        generator = xtime(generator) ^ generator
    }

    for (let value = 0; value < 256; value++) {
        const inverse = value === 0 ? 0 : exp[(255 - log[value]) % 255]
        const substituted =
            inverse ^
            rotateByteLeft(inverse, 1) ^
            rotateByteLeft(inverse, 2) ^
            rotateByteLeft(inverse, 3) ^
            rotateByteLeft(inverse, 4) ^
            0x63
        SBOX[value] = substituted

        const doubled = xtime(substituted)
        const tripled = doubled ^ substituted
        const column = ((doubled << 24) | (substituted << 16) | (substituted << 8) | tripled) >>> 0
        TE0[value] = column
        TE1[value] = ((column >>> 8) | (column << 24)) >>> 0
        TE2[value] = ((column >>> 16) | (column << 16)) >>> 0
        TE3[value] = ((column >>> 24) | (column << 8)) >>> 0
    }
}

buildAesTables()

const roundKeys = new Uint32Array(AES_128_SCHEDULE_WORDS)
const counterBlock = new Uint32Array(4)
const keystreamBlock = new Uint32Array(4)

function readWord(bytes: Uint8Array, offset: number): number {
    return (
        ((bytes[offset] << 24) |
            (bytes[offset + 1] << 16) |
            (bytes[offset + 2] << 8) |
            bytes[offset + 3]) >>>
        0
    )
}

function substituteWord(word: number): number {
    return (
        ((SBOX[word >>> 24] << 24) |
            (SBOX[(word >>> 16) & 0xff] << 16) |
            (SBOX[(word >>> 8) & 0xff] << 8) |
            SBOX[word & 0xff]) >>>
        0
    )
}

function expandAes128Key(key: Uint8Array): void {
    if (key.length !== AES_BLOCK_LENGTH) {
        throw new RangeError(`aes-128 key must be 16 bytes, got ${key.length}`)
    }
    for (let i = 0; i < AES_128_KEY_WORDS; i++) {
        roundKeys[i] = readWord(key, i * 4)
    }
    let roundConstant = 1
    for (let i = AES_128_KEY_WORDS; i < AES_128_SCHEDULE_WORDS; i++) {
        let word = roundKeys[i - 1]
        if (i % AES_128_KEY_WORDS === 0) {
            word = substituteWord(((word << 8) | (word >>> 24)) >>> 0) ^ (roundConstant << 24)
            roundConstant = xtime(roundConstant)
        }
        roundKeys[i] = (roundKeys[i - AES_128_KEY_WORDS] ^ word) >>> 0
    }
}

/** Encrypts `counterBlock` under `roundKeys` into `keystreamBlock`. */
function encryptCounterBlock(): void {
    let s0 = counterBlock[0] ^ roundKeys[0]
    let s1 = counterBlock[1] ^ roundKeys[1]
    let s2 = counterBlock[2] ^ roundKeys[2]
    let s3 = counterBlock[3] ^ roundKeys[3]

    let offset = 4
    for (let round = 1; round < AES_128_ROUNDS; round++) {
        const t0 =
            TE0[s0 >>> 24] ^
            TE1[(s1 >>> 16) & 0xff] ^
            TE2[(s2 >>> 8) & 0xff] ^
            TE3[s3 & 0xff] ^
            roundKeys[offset]
        const t1 =
            TE0[s1 >>> 24] ^
            TE1[(s2 >>> 16) & 0xff] ^
            TE2[(s3 >>> 8) & 0xff] ^
            TE3[s0 & 0xff] ^
            roundKeys[offset + 1]
        const t2 =
            TE0[s2 >>> 24] ^
            TE1[(s3 >>> 16) & 0xff] ^
            TE2[(s0 >>> 8) & 0xff] ^
            TE3[s1 & 0xff] ^
            roundKeys[offset + 2]
        const t3 =
            TE0[s3 >>> 24] ^
            TE1[(s0 >>> 16) & 0xff] ^
            TE2[(s1 >>> 8) & 0xff] ^
            TE3[s2 & 0xff] ^
            roundKeys[offset + 3]
        s0 = t0
        s1 = t1
        s2 = t2
        s3 = t3
        offset += 4
    }

    keystreamBlock[0] =
        ((SBOX[s0 >>> 24] << 24) |
            (SBOX[(s1 >>> 16) & 0xff] << 16) |
            (SBOX[(s2 >>> 8) & 0xff] << 8) |
            SBOX[s3 & 0xff]) ^
        roundKeys[offset]
    keystreamBlock[1] =
        ((SBOX[s1 >>> 24] << 24) |
            (SBOX[(s2 >>> 16) & 0xff] << 16) |
            (SBOX[(s3 >>> 8) & 0xff] << 8) |
            SBOX[s0 & 0xff]) ^
        roundKeys[offset + 1]
    keystreamBlock[2] =
        ((SBOX[s2 >>> 24] << 24) |
            (SBOX[(s3 >>> 16) & 0xff] << 16) |
            (SBOX[(s0 >>> 8) & 0xff] << 8) |
            SBOX[s1 & 0xff]) ^
        roundKeys[offset + 2]
    keystreamBlock[3] =
        ((SBOX[s3 >>> 24] << 24) |
            (SBOX[(s0 >>> 16) & 0xff] << 16) |
            (SBOX[(s1 >>> 8) & 0xff] << 8) |
            SBOX[s2 & 0xff]) ^
        roundKeys[offset + 3]
}

/** Adds one to the counter as a single 128-bit big-endian integer, as OpenSSL does. */
function incrementCounterBlock(): void {
    for (let i = 3; i >= 0; i--) {
        counterBlock[i] = (counterBlock[i] + 1) >>> 0
        if (counterBlock[i] !== 0) return
    }
}

function aesCtr128(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
    if (iv.length !== AES_BLOCK_LENGTH) {
        throw new RangeError(`aes-128-ctr iv must be 16 bytes, got ${iv.length}`)
    }
    expandAes128Key(key)
    for (let i = 0; i < 4; i++) {
        counterBlock[i] = readWord(iv, i * 4)
    }

    const output = new Uint8Array(data.length)
    for (let offset = 0; offset < data.length; offset += AES_BLOCK_LENGTH) {
        encryptCounterBlock()
        incrementCounterBlock()
        const end = Math.min(offset + AES_BLOCK_LENGTH, data.length)
        for (let i = offset; i < end; i++) {
            const index = i - offset
            const word = keystreamBlock[index >>> 2]
            output[i] = data[i] ^ ((word >>> (24 - ((index & 3) << 3))) & 0xff)
        }
    }
    return output
}

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

    digest(): Uint8Array {
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

        const output = new Uint8Array(SHA1_DIGEST_LENGTH)
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

function applyPad(pad: number): Uint8Array {
    for (let i = 0; i < SHA1_BLOCK_LENGTH; i++) {
        keyPad[i] = paddedKey[i] ^ pad
    }
    return keyPad
}

function hmacSha1(key: Uint8Array, ...parts: readonly Uint8Array[]): Uint8Array {
    paddedKey.fill(0)
    if (key.length > SHA1_BLOCK_LENGTH) {
        sha1.reset()
        sha1.update(key)
        paddedKey.set(sha1.digest())
    } else {
        paddedKey.set(key)
    }

    sha1.reset()
    sha1.update(applyPad(HMAC_INNER_PAD))
    for (const part of parts) {
        sha1.update(part)
    }
    const inner = sha1.digest()

    sha1.reset()
    sha1.update(applyPad(HMAC_OUTER_PAD))
    sha1.update(inner)
    return sha1.digest()
}

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
