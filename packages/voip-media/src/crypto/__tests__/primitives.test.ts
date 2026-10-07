import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hexToBytes } from '../../__tests__/_helpers.js'
import { bytesToHex } from '../../bytes.js'
import { nodeCrypto } from '../../node/crypto.js'
import { webCrypto } from '../../web/crypto.js'

const enc = (text: string): Uint8Array => new TextEncoder().encode(text)

const fill = (length: number, value: number): Uint8Array => new Uint8Array(length).fill(value)

const BACKENDS = [
    ['node', nodeCrypto],
    ['web', webCrypto]
] as const

/** Both backends are independent implementations, so a mistyped vector fails on both. */
for (const [name, backend] of BACKENDS) {
    /** FIPS-197 Appendix B and C.1: one block through the cipher, as CTR over a zero block. */
    test(`${name}: aesCtr128 encrypts one block as FIPS-197 specifies`, () => {
        const vectors = [
            [
                '2b7e151628aed2a6abf7158809cf4f3c',
                '3243f6a8885a308d313198a2e0370734',
                '3925841d02dc09fbdc118597196a0b32'
            ],
            [
                '000102030405060708090a0b0c0d0e0f',
                '00112233445566778899aabbccddeeff',
                '69c4e0d86a7b0430d8cdb78070b4c55a'
            ]
        ]
        for (const [key, block, expected] of vectors) {
            const out = backend.aesCtr128(hexToBytes(key), hexToBytes(block), new Uint8Array(16))
            assert.equal(bytesToHex(out), expected)
        }
    })

    /** NIST SP 800-38A F.5.1, whose counter carries out of the last byte on its second block. */
    test(`${name}: aesCtr128 matches the SP 800-38A CTR-AES128 vector`, () => {
        const out = backend.aesCtr128(
            hexToBytes('2b7e151628aed2a6abf7158809cf4f3c'),
            hexToBytes('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'),
            hexToBytes(
                '6bc1bee22e409f96e93d7e117393172a' +
                    'ae2d8a571e03ac9c9eb76fac45af8e51' +
                    '30c81c46a35ce411e5fbc1191a0a52ef' +
                    'f69f2445df4f9b17ad2b417be66c3710'
            )
        )
        assert.equal(
            bytesToHex(out),
            '874d6191b620e3261bef6864990db6ce' +
                '9806f66b7970fdff8617187bb9fffdff' +
                '5ae4df3edbd5d35e5b4f09020db03eab' +
                '1e031dda2fbe03d1792170a0f3009cee'
        )
    })

    /** RFC 3711 B.2: the SRTP AES-CM keystream, at the start and across the 16-bit counter wrap. */
    test(`${name}: aesCtr128 produces the RFC 3711 AES-CM keystream`, () => {
        const key = hexToBytes('2b7e151628aed2a6abf7158809cf4f3c')
        const start = backend.aesCtr128(
            key,
            hexToBytes('f0f1f2f3f4f5f6f7f8f9fafbfcfd0000'),
            new Uint8Array(48)
        )
        assert.equal(
            bytesToHex(start),
            'e03ead0935c95e80e166b16dd92b4eb4' +
                'd23513162b02d0f72a43a2fe4a5f97ab' +
                '41e95b3bb0a2e8dd477901e4fca894c0'
        )

        const wrap = backend.aesCtr128(
            key,
            hexToBytes('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff'),
            new Uint8Array(48)
        )
        assert.equal(
            bytesToHex(wrap),
            'ec8cdf7398607cb0f2d21675ea9ea1e4' +
                '362b7c3c6773516318a077d7fc5073ae' +
                '6a2cc3787889374fbeb4c81b17ba6c44'
        )
    })

    test(`${name}: aesCtr128 carries the counter through all 128 bits`, () => {
        const key = hexToBytes('000102030405060708090a0b0c0d0e0f')
        const out = backend.aesCtr128(key, fill(16, 0xff), new Uint8Array(32))
        const wrapped = backend.aesCtr128(key, new Uint8Array(16), new Uint8Array(16))
        assert.equal(bytesToHex(out.subarray(16)), bytesToHex(wrapped))
    })

    test(`${name}: aesCtr128 handles a partial trailing block and an empty input`, () => {
        const key = hexToBytes('2b7e151628aed2a6abf7158809cf4f3c')
        const iv = hexToBytes('f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff')
        const full = backend.aesCtr128(key, iv, new Uint8Array(32))
        const partial = backend.aesCtr128(key, iv, new Uint8Array(21))
        assert.equal(bytesToHex(partial), bytesToHex(full.subarray(0, 21)))
        assert.equal(backend.aesCtr128(key, iv, new Uint8Array(0)).length, 0)
    })

    /** RFC 2202 section 3, all seven HMAC-SHA1 cases. */
    test(`${name}: hmacSha1 matches every RFC 2202 test case`, () => {
        const vectors: [Uint8Array, Uint8Array, string][] = [
            [fill(20, 0x0b), enc('Hi There'), 'b617318655057264e28bc0b6fb378c8ef146be00'],
            [
                enc('Jefe'),
                enc('what do ya want for nothing?'),
                'effcdf6ae5eb2fa2d27416d5f184df9c259a7c79'
            ],
            [fill(20, 0xaa), fill(50, 0xdd), '125d7342b9ac11cd91a39af48aa17b4f63f175d3'],
            [
                hexToBytes('0102030405060708090a0b0c0d0e0f10111213141516171819'),
                fill(50, 0xcd),
                '4c9007f4026250c6bc8414f9bf50c86c2d7235da'
            ],
            [
                fill(20, 0x0c),
                enc('Test With Truncation'),
                '4c1a03424b55e07fe7f27be1d58bb9324a9a5a04'
            ],
            [
                fill(80, 0xaa),
                enc('Test Using Larger Than Block-Size Key - Hash Key First'),
                'aa4ae5e15272d00e95705637ce8a3b55ed402112'
            ],
            [
                fill(80, 0xaa),
                enc('Test Using Larger Than Block-Size Key and Larger Than One Block-Size Data'),
                'e8e99d0f45237d786d6bbaa7965c7808bbff1a91'
            ]
        ]
        for (const [key, data, expected] of vectors) {
            assert.equal(bytesToHex(backend.hmacSha1(key, data)), expected)
        }
    })

    test(`${name}: hmacSha1 concatenates parts identically to a single buffer`, () => {
        const joined = backend.hmacSha1(
            enc('key'),
            enc('The quick brown fox '),
            enc('jumps over the lazy dog')
        )
        const single = backend.hmacSha1(
            enc('key'),
            enc('The quick brown fox jumps over the lazy dog')
        )
        assert.equal(bytesToHex(joined), bytesToHex(single))
        assert.equal(bytesToHex(single), 'de7c9b85b8b78aa6bc8a7a36f70a90701c9db4d9')
    })

    test(`${name}: timingSafeEqual answers equal, different and mismatched lengths`, () => {
        assert.equal(backend.timingSafeEqual(fill(10, 7), fill(10, 7)), true)
        const flipped = fill(10, 7)
        flipped[9] ^= 1
        assert.equal(backend.timingSafeEqual(fill(10, 7), flipped), false)
        assert.equal(backend.timingSafeEqual(fill(10, 7), fill(4, 7)), false)
        assert.equal(backend.timingSafeEqual(new Uint8Array(0), new Uint8Array(0)), true)
    })
}

/** Deterministic, so a disagreement reproduces from the index it reports. */
function createByteSource(seed: number): (length: number) => Uint8Array {
    let state = seed >>> 0 || 1
    return (length) => {
        const out = new Uint8Array(length)
        for (let i = 0; i < length; i++) {
            state ^= state << 13
            state ^= state >>> 17
            state ^= state << 5
            out[i] = state & 0xff
        }
        return out
    }
}

/** Sweeps lengths across SHA-1 padding (55, 56, 64), the AES block and the HMAC block size. */
test('the web primitives agree with node:crypto across lengths and keys', () => {
    const bytes = createByteSource(0x5eed)

    for (let i = 0; i < 400; i++) {
        const key = bytes(16)
        const iv = i % 7 === 0 ? fill(16, 0xff) : bytes(16)
        const data = bytes(i < 200 ? i : (i * 37) % 1500)
        assert.equal(
            bytesToHex(webCrypto.aesCtr128(key, iv, data)),
            bytesToHex(nodeCrypto.aesCtr128(key, iv, data)),
            `aesCtr128 case ${i}`
        )
    }

    for (let i = 0; i < 400; i++) {
        const key = bytes(i % 131)
        const parts = [bytes(i % 70), bytes((i * 13) % 150), bytes(i % 3 === 0 ? 0 : 64)]
        assert.equal(
            bytesToHex(webCrypto.hmacSha1(key, ...parts)),
            bytesToHex(nodeCrypto.hmacSha1(key, ...parts)),
            `hmacSha1 case ${i}`
        )
    }
})
