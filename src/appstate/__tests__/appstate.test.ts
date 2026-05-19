import assert from 'node:assert/strict'
import test from 'node:test'

import { keyEpoch, parseCollectionName, pickActiveSyncKey } from '@appstate/utils'
import { WA_APP_STATE_COLLECTIONS } from '@protocol/constants'
import { intToBytes } from '@util/bytes'

test('appstate utils parse collection names, key metadata and active key ordering', () => {
    assert.equal(
        parseCollectionName(WA_APP_STATE_COLLECTIONS.REGULAR),
        WA_APP_STATE_COLLECTIONS.REGULAR
    )
    assert.equal(parseCollectionName('unknown'), null)

    const keyA = new Uint8Array([0, 2, 0, 0, 0, 1])
    const keyB = new Uint8Array([0, 1, 0, 0, 0, 2])

    assert.equal(keyEpoch(keyA), 1)

    const active = pickActiveSyncKey([
        { keyId: keyA, keyData: new Uint8Array([1]), timestamp: 1 },
        { keyId: keyB, keyData: new Uint8Array([2]), timestamp: 2 }
    ])
    assert.deepEqual(active?.keyId, keyB)

    assert.deepEqual(intToBytes(8, 0x1_0000_0002), new Uint8Array([0, 0, 0, 1, 0, 0, 0, 2]))
})
