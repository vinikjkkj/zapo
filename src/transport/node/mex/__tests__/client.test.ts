import { strict as assert } from 'node:assert'
import { test } from 'node:test'

import { registerMexArgoWireType } from '@transport/node/mex/argo-wire'
import { dispatchMexQuery } from '@transport/node/mex/client'
import type { BinaryNode } from '@transport/types'
import { base64ToBytes, TEXT_ENCODER } from '@util/bytes'

function jsonBytes(value: unknown): Uint8Array {
    return TEXT_ENCODER.encode(JSON.stringify(value))
}

test('dispatchMexQuery passes variables verbatim and parses raw JSON response', async () => {
    let captured: BinaryNode | null = null
    const fakeSocket = {
        query: async (node: BinaryNode): Promise<BinaryNode> => {
            captured = node
            return {
                tag: 'iq',
                attrs: { type: 'result', from: 's.whatsapp.net' },
                content: [
                    {
                        tag: 'result',
                        attrs: {},
                        content: jsonBytes({ data: { ok: true } })
                    }
                ]
            }
        }
    }
    const { data } = await dispatchMexQuery(fakeSocket, {
        docId: '8548056818544135',
        clientDocId: '25777518041400352865446016972',
        variables: { input: { use_case: 'CANONICAL', request_time: '17' } },
        opName: 'WWWCreateUser'
    })
    assert.deepEqual(data, { ok: true })

    assert.ok(captured !== null)
    const node = captured as BinaryNode
    assert.equal(node.attrs.xmlns, 'w:mex')
    const queryNode = Array.isArray(node.content) ? node.content[0]! : null
    assert.ok(queryNode)
    assert.equal(queryNode.attrs.query_id, '8548056818544135')
    assert.equal(
        queryNode.content,
        '{"queryId":"25777518041400352865446016972","variables":{"input":{"use_case":"CANONICAL","request_time":"17"}}}'
    )
})

test('dispatchMexQuery passes top-level variables without wrapping', async () => {
    let captured: BinaryNode | null = null
    const fakeSocket = {
        query: async (node: BinaryNode): Promise<BinaryNode> => {
            captured = node
            return {
                tag: 'iq',
                attrs: { type: 'result' },
                content: [{ tag: 'result', attrs: {}, content: jsonBytes({ data: null }) }]
            }
        }
    }
    await dispatchMexQuery(fakeSocket, {
        docId: 'd',
        clientDocId: 'c',
        variables: { newsletter_id: 'n', user_id: 'u' },
        opName: 'WWWChangeNewsletterOwner'
    })
    const queryNode = Array.isArray(captured!.content) ? captured!.content[0]! : null
    assert.ok(queryNode)
    assert.equal(
        queryNode.content,
        '{"queryId":"c","variables":{"newsletter_id":"n","user_id":"u"}}'
    )
})

test('dispatchMexQuery surfaces GraphQL errors with path and code', async () => {
    const fakeSocket = {
        query: async (): Promise<BinaryNode> => ({
            tag: 'iq',
            attrs: { type: 'result' },
            content: [
                {
                    tag: 'result',
                    attrs: {},
                    content: jsonBytes({
                        data: null,
                        errors: [
                            {
                                extensions: { error_code: 400, severity: 'CRITICAL' },
                                message: 'Bad Request',
                                path: ['xwa2_ent_get_certificates']
                            }
                        ]
                    })
                }
            ]
        })
    }
    await assert.rejects(
        () =>
            dispatchMexQuery(fakeSocket, {
                docId: 'a',
                clientDocId: 'b',
                variables: {},
                opName: 'WWWGetCertificates'
            }),
        /400: Bad Request @xwa2_ent_get_certificates/
    )
})

function argoSocket(payload: Uint8Array): { query: () => Promise<BinaryNode> } {
    return {
        query: async (): Promise<BinaryNode> => ({
            tag: 'iq',
            attrs: { type: 'result' },
            content: [{ tag: 'result', attrs: { format: 'argo' }, content: payload }]
        })
    }
}

test('dispatchMexQuery decodes a captured argo result', async () => {
    // Real `format="argo"` result for FetchReachoutTimelock.
    const captured = base64ToBytes('BBQxNzg4MTMyNzYzDkRFRkFVTFQMAAIUDgMD')

    const { data } = await dispatchMexQuery(argoSocket(captured), {
        docId: '23983697327930364',
        clientDocId: '23983697327930364',
        variables: {},
        opName: 'FetchReachoutTimelock'
    })

    assert.deepEqual(data, {
        xwa2_fetch_account_reachout_timelock: {
            is_active: true,
            time_enforcement_ends: '1788132763',
            enforcement_type: 'DEFAULT'
        }
    })
})

test('dispatchMexQuery surfaces argo errors with their extensions', async () => {
    // Real argo response captured after a failed WWWGetCertificates call
    // (variables {use_case=CANONICAL, request_time=17}).
    const captured = base64ToBytes(
        'BK4CVGhlIHNjaGVtYSBzcGVjaWZpZXMgdGhlIGZpZWxkIGlzIG5vbi1udWxsLCBidXQgYSBudWxsIHZhbHVlIHdhcyByZXR1cm5lZCBieSB0aGUgYmFja2VuZGNvZGVudWxsX3ZhbHVlQmFkIFJlcXVlc3RlcnJvcl9jb2RlaXNfcmV0cnlhYmxlc2V2ZXJpdHlDUklUSUNBTAgAAKAGNAEEsAEDAgAEAggIFBYDAgAEBhQMGAAQCBAD'
    )
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
            { name: 'errors', of: { type: 'ARRAY', of: { type: 'ERROR' } }, omittable: true },
            { name: 'extensions', of: { type: 'EXTENSIONS' }, omittable: true }
        ]
    })

    await assert.rejects(
        () =>
            dispatchMexQuery(argoSocket(captured), {
                docId: '25094190163544446',
                clientDocId: '16428758503015954638431529919',
                variables: { use_case: 'CANONICAL', request_time: '17' },
                opName: 'WWWGetCertificates'
            }),
        (error: Error) =>
            /null_value: The schema specifies the field is non-null/.test(error.message) &&
            /400\/CRITICAL: Bad Request @xwa2_ent_get_certificates/.test(error.message)
    )
})

test('dispatchMexQuery reports argo operations without a known wire type', async () => {
    await assert.rejects(
        () =>
            dispatchMexQuery(argoSocket(base64ToBytes('BBQxNzg4MTMyNzYzDkRFRkFVTFQMAAIUDgMD')), {
                docId: 'a',
                clientDocId: 'b',
                variables: {},
                opName: 'FetchAboutStatus'
            }),
        /argo response has no known wire type; register one with registerMexArgoWireType/
    )
})

test('dispatchMexQuery raises decode failure when argo bytes are malformed', async () => {
    await assert.rejects(
        () =>
            dispatchMexQuery(argoSocket(TEXT_ENCODER.encode('not real argo bytes')), {
                docId: 'a',
                clientDocId: 'b',
                variables: {},
                opName: 'FetchReachoutTimelock'
            }),
        /argo decode failed/
    )
})
