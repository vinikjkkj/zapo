import assert from 'node:assert/strict'
import { test } from 'node:test'

import { hexToBytes } from '../../__tests__/_helpers.js'
import { bytesToHex } from '../../bytes.js'
import { nodeCrypto } from '../../node/crypto.js'
import { SRTP_LABEL } from '../../types.js'
import { webCrypto } from '../../web/crypto.js'
import { deriveSrtpSessionKey } from '../srtp.js'

const BACKENDS = [
    ['node', nodeCrypto],
    ['web', webCrypto]
] as const

/** RFC 3711 B.3: the three session keys of one master key, with no key derivation rate. */
for (const [name, crypto] of BACKENDS) {
    test(`${name}: session keys derive exactly as RFC 3711 B.3 lists them`, () => {
        const masterKey = hexToBytes('e1f97a0d3e018be0d64fa32c06de4139')
        const masterSalt = hexToBytes('0ec675ad498afeebb6960b3aabe6')

        assert.equal(
            bytesToHex(
                deriveSrtpSessionKey(crypto, masterKey, masterSalt, SRTP_LABEL.ENCRYPTION, 16)
            ),
            'c61e7a93744f39ee10734afe3ff7a087'
        )
        assert.equal(
            bytesToHex(deriveSrtpSessionKey(crypto, masterKey, masterSalt, SRTP_LABEL.SALT, 14)),
            '30cbbc08863d8c85d49db34a9ae1'
        )
        assert.equal(
            bytesToHex(deriveSrtpSessionKey(crypto, masterKey, masterSalt, SRTP_LABEL.AUTH, 20)),
            'cebe321f6ff7716b6fd4ab49af256a156d38baa4'
        )
    })
}
