import assert from 'node:assert/strict'
import test from 'node:test'

import {
    decodeAppStateCollections,
    decodeAppStateFingerprint,
    decodeAppStateSyncKeys,
    encodeAppStateFingerprint
} from '@appstate/encoding'

test('appstate sqlite helper encodes/decodes sync key fingerprints', () => {
    const fingerprint = {
        rawId: 10,
        currentIndex: 1,
        deviceIndexes: [2, 3]
    }

    const encoded = encodeAppStateFingerprint(fingerprint)
    assert.ok(encoded)

    const decoded = decodeAppStateFingerprint(encoded)
    assert.equal(decoded?.rawId, 10)
    assert.equal(decodeAppStateFingerprint(undefined), undefined)

    assert.throws(
        () => decodeAppStateFingerprint(new Uint8Array([1, 2, 3])),
        /invalid appstate_sync_keys.fingerprint protobuf payload/
    )
})

test('appstate sqlite helper decodes sync key and collection rows', () => {
    const syncKeys = decodeAppStateSyncKeys([
        {
            key_id: new Uint8Array([1, 2]),
            key_data: new Uint8Array([3, 4]),
            timestamp: 10,
            fingerprint: null
        }
    ])

    assert.equal(syncKeys.length, 1)
    assert.equal(syncKeys[0].timestamp, 10)

    const collections = decodeAppStateCollections(
        [
            {
                collection: 'regular',
                version: 3,
                hash: new Uint8Array([1, 1])
            }
        ],
        [
            {
                collection: 'regular',
                index_mac_hex: 'ab',
                value_mac: new Uint8Array([9])
            }
        ]
    )

    assert.ok(collections.regular)
    assert.equal(collections.regular?.version, 3)
    assert.deepEqual(collections.regular?.indexValueMap['ab'], new Uint8Array([9]))
})
