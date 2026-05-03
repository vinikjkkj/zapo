import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { bytesToHex } from 'zapo-js/util'

import { convertBaileysAppStateSyncKey, convertBaileysAppStateVersion } from '../baileys/appstate'

describe('convertBaileysAppStateSyncKey', () => {
    it('decodes base64 keyId strings and coerces string timestamps', () => {
        const result = convertBaileysAppStateSyncKey('AAECAwQ=', {
            keyData: new Uint8Array([10, 20, 30]),
            timestamp: '1700000000',
            fingerprint: { rawId: 7, currentIndex: 1, deviceIndexes: [0, 12] }
        })
        assert.deepEqual(Array.from(result.keyId), [0, 1, 2, 3, 4])
        assert.deepEqual(Array.from(result.keyData), [10, 20, 30])
        assert.equal(result.timestamp, 1700000000)
        assert.equal(result.fingerprint?.rawId, 7)
        assert.deepEqual(result.fingerprint?.deviceIndexes, [0, 12])
    })

    it('accepts raw Uint8Array keyId', () => {
        const id = new Uint8Array([99])
        const result = convertBaileysAppStateSyncKey(id, {
            keyData: new Uint8Array([1]),
            timestamp: 42
        })
        assert.equal(result.keyId, id)
        assert.equal(result.timestamp, 42)
        assert.equal(result.fingerprint, undefined)
    })
})

describe('convertBaileysAppStateVersion', () => {
    it('rekeys indexValueMap from base64(indexMac) to hex', () => {
        const indexMac = new Uint8Array([0xab, 0xcd, 0xef])
        const valueMac = new Uint8Array([1, 2, 3])
        const indexB64 = Buffer.from(indexMac).toString('base64')

        const result = convertBaileysAppStateVersion('regular', {
            version: 5,
            hash: new Uint8Array(128),
            indexValueMap: {
                [indexB64]: { valueMac }
            }
        })

        assert.equal(result.collection, 'regular')
        assert.equal(result.version, 5)
        assert.equal(result.hash.length, 128)
        const hexKey = bytesToHex(indexMac)
        assert.equal(result.indexValueMap.get(hexKey), valueMac)
    })
})
