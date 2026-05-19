import assert from 'node:assert/strict'
import test from 'node:test'

import { parseCollectionState, parseSyncResponse } from '@appstate/parsers/response-parser'
import { proto } from '@proto'
import {
    WA_APP_STATE_COLLECTION_STATES,
    WA_APP_STATE_COLLECTIONS,
    WA_APP_STATE_ERROR_CODES,
    WA_IQ_TYPES,
    WA_NODE_TAGS
} from '@protocol/constants'

test('appstate sync response parser decodes collection state, patches and references', () => {
    const patchBytes = proto.SyncdPatch.encode({}).finish()
    const snapshotBytes = proto.ExternalBlobReference.encode({
        directPath: '/snapshot',
        mediaKey: new Uint8Array([1]),
        fileSha256: new Uint8Array([2]),
        fileEncSha256: new Uint8Array([3])
    }).finish()

    const iqNode = {
        tag: 'iq',
        attrs: { type: 'result' },
        content: [
            {
                tag: WA_NODE_TAGS.SYNC,
                attrs: {},
                content: [
                    {
                        tag: WA_NODE_TAGS.COLLECTION,
                        attrs: {
                            name: WA_APP_STATE_COLLECTIONS.REGULAR,
                            version: '10'
                        },
                        content: [
                            {
                                tag: WA_NODE_TAGS.PATCHES,
                                attrs: {},
                                content: [
                                    { tag: WA_NODE_TAGS.PATCH, attrs: {}, content: patchBytes }
                                ]
                            },
                            {
                                tag: WA_NODE_TAGS.SNAPSHOT,
                                attrs: {},
                                content: snapshotBytes
                            }
                        ]
                    }
                ]
            }
        ]
    }

    const payloads = parseSyncResponse(iqNode)
    assert.equal(payloads.length, 1)
    assert.equal(payloads[0].collection, WA_APP_STATE_COLLECTIONS.REGULAR)
    assert.equal(payloads[0].state, WA_APP_STATE_COLLECTION_STATES.SUCCESS)
    assert.equal(payloads[0].version, 10)
    assert.equal(payloads[0].patches.length, 1)
    assert.ok(payloads[0].snapshotReference)

    const conflictNode = {
        tag: WA_NODE_TAGS.COLLECTION,
        attrs: { type: WA_IQ_TYPES.ERROR },
        content: [{ tag: WA_NODE_TAGS.ERROR, attrs: { code: WA_APP_STATE_ERROR_CODES.CONFLICT } }]
    }
    assert.equal(parseCollectionState(conflictNode), WA_APP_STATE_COLLECTION_STATES.CONFLICT)

    assert.throws(
        () =>
            parseSyncResponse({
                tag: WA_NODE_TAGS.IQ,
                attrs: { type: WA_IQ_TYPES.ERROR },
                content: [
                    {
                        tag: WA_NODE_TAGS.ERROR,
                        attrs: { code: '400', text: 'bad-request' }
                    }
                ]
            }),
        /sync iq failed \(400: bad-request\)/
    )
})
