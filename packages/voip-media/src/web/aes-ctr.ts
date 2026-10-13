/** AES-128-CTR in plain JS over field-built tables and per-key cached schedules. */

import { cachedState, type KeyedState, readWord } from './keyed-state.js'

const AES_BLOCK_LENGTH = 16
const AES_128_ROUNDS = 10
const AES_128_KEY_WORDS = 4
const AES_128_SCHEDULE_WORDS = AES_BLOCK_LENGTH + AES_128_ROUNDS * AES_128_KEY_WORDS

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

const counterBlock = new Uint32Array(4)
const keystreamBlock = new Uint32Array(4)

function substituteWord(word: number): number {
    return (
        ((SBOX[word >>> 24] << 24) |
            (SBOX[(word >>> 16) & 0xff] << 16) |
            (SBOX[(word >>> 8) & 0xff] << 8) |
            SBOX[word & 0xff]) >>>
        0
    )
}

function expandAes128Key(key: Uint8Array, roundKeys: Uint32Array): void {
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
function encryptCounterBlock(roundKeys: Uint32Array): void {
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

const aesSchedules = new WeakMap<Uint8Array, KeyedState>()

export function aesCtr128(key: Uint8Array, iv: Uint8Array, data: Uint8Array): Uint8Array {
    if (key.length !== AES_BLOCK_LENGTH) {
        throw new RangeError(`aes-128 key must be 16 bytes, got ${key.length}`)
    }
    if (iv.length !== AES_BLOCK_LENGTH) {
        throw new RangeError(`aes-128-ctr iv must be 16 bytes, got ${iv.length}`)
    }
    const roundKeys = cachedState(aesSchedules, key, expandAes128Key, AES_128_SCHEDULE_WORDS)
    for (let i = 0; i < 4; i++) {
        counterBlock[i] = readWord(iv, i * 4)
    }

    const output = new Uint8Array(data.length)
    const fullBlocksEnd = data.length - (data.length % AES_BLOCK_LENGTH)
    let offset = 0
    for (; offset < fullBlocksEnd; offset += AES_BLOCK_LENGTH) {
        encryptCounterBlock(roundKeys)
        incrementCounterBlock()
        for (let w = 0; w < 4; w++) {
            const word = keystreamBlock[w]
            const i = offset + w * 4
            output[i] = data[i] ^ (word >>> 24)
            output[i + 1] = data[i + 1] ^ ((word >>> 16) & 0xff)
            output[i + 2] = data[i + 2] ^ ((word >>> 8) & 0xff)
            output[i + 3] = data[i + 3] ^ (word & 0xff)
        }
    }
    if (offset < data.length) {
        encryptCounterBlock(roundKeys)
        incrementCounterBlock()
        for (let i = offset; i < data.length; i++) {
            const index = i - offset
            const word = keystreamBlock[index >>> 2]
            output[i] = data[i] ^ ((word >>> (24 - ((index & 3) << 3))) & 0xff)
        }
    }
    return output
}
