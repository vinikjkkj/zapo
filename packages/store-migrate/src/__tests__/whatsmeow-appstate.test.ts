import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { encodeAppStateFingerprint } from 'zapo-js/appstate'
import { bytesToHex } from 'zapo-js/util'

import {
    convertWhatsmeowAppStateSyncKey,
    convertWhatsmeowAppStateVersion
} from '../whatsmeow/appstate'

describe('convertWhatsmeowAppStateSyncKey', () => {
    it('decodes the embedded fingerprint protobuf', () => {
        const fingerprint = encodeAppStateFingerprint({
            rawId: 42,
            currentIndex: 1,
            deviceIndexes: [0, 12]
        })
        assert.ok(fingerprint)
        const result = convertWhatsmeowAppStateSyncKey({
            key_id: new Uint8Array([1, 2, 3]),
            key_data: new Uint8Array([10]),
            timestamp: 1700000000n,
            fingerprint: fingerprint
        })
        assert.equal(result.timestamp, 1700000000)
        assert.equal(result.fingerprint?.rawId, 42)
        assert.deepEqual(result.fingerprint?.deviceIndexes, [0, 12])
    })
})

describe('convertWhatsmeowAppStateVersion', () => {
    it('joins mutation MAC rows into hex-keyed indexValueMap', () => {
        const indexA = new Uint8Array([0xaa, 0xbb])
        const indexB = new Uint8Array([0xcc, 0xdd])
        const valueA = new Uint8Array([1])
        const valueB = new Uint8Array([2])

        const result = convertWhatsmeowAppStateVersion(
            { name: 'regular', version: 7, hash: new Uint8Array(128) },
            [
                { index_mac: indexA, value_mac: valueA },
                { index_mac: indexB, value_mac: valueB }
            ]
        )

        assert.equal(result.collection, 'regular')
        assert.equal(result.version, 7)
        assert.equal(result.indexValueMap.get(bytesToHex(indexA)), valueA)
        assert.equal(result.indexValueMap.get(bytesToHex(indexB)), valueB)
    })
})
