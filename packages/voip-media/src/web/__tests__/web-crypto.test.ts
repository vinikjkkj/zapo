import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bytesToHex } from '../../bytes.js'
import { nodeCrypto } from '../../node/crypto.js'
import { webCrypto } from '../crypto.js'

function bytesFrom(seed: number, length: number): Uint8Array {
    const out = new Uint8Array(length)
    let state = seed | 1
    for (let i = 0; i < length; i++) {
        state ^= state << 13
        state ^= state >>> 17
        state ^= state << 5
        out[i] = state & 0xff
    }
    return out
}

/** The per-key caches must follow a key swap, a buffer rewritten in place and two interleaved keys. */
test('the cached key state follows key changes across a run of packets', () => {
    const sendKey = bytesFrom(1, 16)
    const recvKey = bytesFrom(2, 16)
    const sendAuth = bytesFrom(3, 20)
    const recvAuth = bytesFrom(4, 20)
    const longAuth = bytesFrom(5, 100)

    const check = (aesKey: Uint8Array, authKey: Uint8Array, packet: number): void => {
        const iv = bytesFrom(100 + packet, 16)
        const data = bytesFrom(200 + packet, 20 + ((packet * 37) % 1200))
        assert.equal(
            bytesToHex(webCrypto.aesCtr128(aesKey, iv, data)),
            bytesToHex(nodeCrypto.aesCtr128(aesKey, iv, data)),
            `aes packet ${packet}`
        )
        const head = data.subarray(0, 12)
        const roc = bytesFrom(300 + packet, 4)
        assert.equal(
            bytesToHex(webCrypto.hmacSha1(authKey, head, data, roc)),
            bytesToHex(nodeCrypto.hmacSha1(authKey, head, data, roc)),
            `hmac packet ${packet}`
        )
    }

    for (let packet = 0; packet < 20; packet++) {
        check(sendKey, sendAuth, packet)
        check(recvKey, recvAuth, packet + 1000)
    }

    for (let packet = 20; packet < 30; packet++) {
        check(bytesFrom(6, 16), bytesFrom(7, 20), packet)
    }

    sendKey.set(bytesFrom(8, 16))
    sendAuth.set(bytesFrom(9, 20))
    for (let packet = 30; packet < 40; packet++) {
        check(sendKey, sendAuth, packet)
        check(recvKey, longAuth, packet)
    }
})
