import assert from 'node:assert/strict'
import test from 'node:test'

import { proto } from '@proto'

test('the call message round-trips through the protobuf encoder', () => {
    const callKey = new Uint8Array(32).fill(7)
    const encoded = proto.Message.encode({ call: { callKey } }).finish()
    const decoded = proto.Message.decode(encoded)
    assert.deepEqual(new Uint8Array(decoded.call!.callKey!), callKey)
})
