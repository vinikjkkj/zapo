import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { decodeMexArgoResponse } from '@transport/node/mex/argo-decoder'
import {
    listMexArgoWireTypeNames,
    registerMexArgoWireType,
    resolveMexArgoWireType
} from '@transport/node/mex/argo-wire'
import { base64ToBytes } from '@util/bytes'

function wireOf(opName: string) {
    const wire = resolveMexArgoWireType(opName)
    assert.ok(wire, `missing bundled wire type for ${opName}`)
    return wire
}

test('decodes a captured FetchReachoutTimelock argo payload', () => {
    // Real `format="argo"` result. Header 0x04 is out-of-band field errors, not
    // self-describing: the core is `[0, 1, 10, 7, -2, -2]` and the two blocks
    // hold "1788132763" (String) and "DEFAULT" (XWA2ReachoutTimelockType).
    const captured = base64ToBytes('BBQxNzg4MTMyNzYzDkRFRkFVTFQMAAIUDgMD')

    const decoded = decodeMexArgoResponse(captured, wireOf('FetchReachoutTimelock'))

    assert.deepEqual(decoded.data, {
        xwa2_fetch_account_reachout_timelock: {
            is_active: true,
            time_enforcement_ends: '1788132763',
            enforcement_type: 'DEFAULT'
        }
    })
    assert.deepEqual(decoded.errors, [])
})

test('decodes typed errors, int block values and resolved paths', () => {
    // Real argo error response for WWWGetCertificates (`use_case=CANONICAL`).
    const captured = base64ToBytes(
        'BK4CVGhlIHNjaGVtYSBzcGVjaWZpZXMgdGhlIGZpZWxkIGlzIG5vbi1udWxsLCBidXQgYSBudWxsIHZhbHVlIHdhcyByZXR1cm5lZCBieSB0aGUgYmFja2VuZGNvZGVudWxsX3ZhbHVlQmFkIFJlcXVlc3RlcnJvcl9jb2RlaXNfcmV0cnlhYmxlc2V2ZXJpdHlDUklUSUNBTAgAAKAGNAEEsAEDAgAEAggIFBYDAgAEBhQMGAAQCBAD'
    )

    // Not in the bundled table (the Android store has no WWW* operation), so it
    // doubles as the registration path. Only the shape the payload exercises is
    // declared: a nullable root field plus the response envelope.
    registerMexArgoWireType('WWWGetCertificates', {
        type: 'RECORD',
        fields: [
            {
                name: 'data',
                of: {
                    type: 'NULLABLE',
                    of: {
                        type: 'RECORD',
                        fields: [
                            {
                                name: 'xwa2_ent_get_certificates',
                                of: { type: 'NULLABLE', of: { type: 'DESC' } },
                                omittable: false
                            }
                        ]
                    }
                },
                omittable: false
            },
            {
                name: 'errors',
                of: { type: 'ARRAY', of: { type: 'ERROR' } },
                omittable: true
            },
            { name: 'extensions', of: { type: 'EXTENSIONS' }, omittable: true }
        ]
    })

    const decoded = decodeMexArgoResponse(captured, wireOf('WWWGetCertificates'))

    assert.equal(decoded.data, null)
    assert.deepEqual(decoded.errors, [
        {
            message:
                'The schema specifies the field is non-null, but a null value was returned by the backend',
            locations: null,
            path: ['xwa2_ent_get_certificates'],
            extensions: { code: 'null_value' }
        },
        {
            message: 'Bad Request',
            locations: null,
            path: ['xwa2_ent_get_certificates'],
            extensions: { error_code: 400, is_retryable: false, severity: 'CRITICAL' }
        }
    ])
})

test('rejects a wire type that leaves bytes behind', () => {
    const captured = base64ToBytes('BBQxNzg4MTMyNzYzDkRFRkFVTFQMAAIUDgMD')

    assert.throws(
        () =>
            decodeMexArgoResponse(captured, {
                type: 'RECORD',
                fields: [
                    {
                        name: 'data',
                        of: { type: 'NULLABLE', of: { type: 'RECORD', fields: [] } },
                        omittable: false
                    }
                ]
            }),
        /trailing byte/
    )
})

test('rejects a boolean label other than 0 or 1', () => {
    const captured = base64ToBytes('BBQxNzg4MTMyNzYzDkRFRkFVTFQMAAIUDgMD')
    // Core is the last 6 bytes; byte 2 of it is `is_active`, zig-zag 2 -> 4.
    captured[captured.length - 5] = 0x04

    assert.throws(
        () => decodeMexArgoResponse(captured, wireOf('FetchReachoutTimelock')),
        /invalid boolean label 2/
    )
})

test('expands every bundled wire type', () => {
    for (const opName of listMexArgoWireTypeNames()) {
        assert.equal(wireOf(opName).type, 'RECORD', opName)
    }
})

test('reads the header flags from the raw byte, not from a bit set', () => {
    // 0x02 is self-describing, so the wire type is ignored and the core is a
    // DESC tree: object with one "ok" -> true entry.
    const captured = base64ToBytes('AgRvawgEAgQC')

    const decoded = decodeMexArgoResponse(captured, { type: 'DESC' })

    assert.deepEqual(decoded.data, { ok: true })
})
