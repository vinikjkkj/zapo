import assert from 'node:assert/strict'
import test from 'node:test'

import { WA_STREAM_SIGNALING } from '@protocol/constants'
import {
    parseCompanionEncStatic,
    parseStreamControlNode,
    parseSuccessPersistAttributes
} from '@transport/stream/parse'
import type { BinaryNode } from '@transport/types'
import { bytesToBase64 } from '@util/bytes'
import { parseOptionalInt } from '@util/primitives'

test('parseOptionalInt parses strict unsigned numbers only', () => {
    assert.equal(parseOptionalInt('123'), 123)
    assert.equal(parseOptionalInt(undefined), undefined)
    assert.equal(parseOptionalInt('12.3'), undefined)
    assert.equal(parseOptionalInt('-1'), undefined)
})

test('parseStreamControlNode handles stream error variants', () => {
    const xmlStreamEnd: BinaryNode = {
        tag: WA_STREAM_SIGNALING.XML_STREAM_END_TAG,
        attrs: {}
    }
    assert.deepEqual(parseStreamControlNode(xmlStreamEnd), { kind: 'xmlstreamend' })

    const replacedError: BinaryNode = {
        tag: WA_STREAM_SIGNALING.STREAM_ERROR_TAG,
        attrs: {},
        content: [{ tag: WA_STREAM_SIGNALING.CONFLICT_TAG, attrs: { type: 'replaced' } }]
    }
    assert.deepEqual(parseStreamControlNode(replacedError), { kind: 'stream_error_replaced' })

    const codeError: BinaryNode = {
        tag: WA_STREAM_SIGNALING.STREAM_ERROR_TAG,
        attrs: { code: '500' }
    }
    assert.deepEqual(parseStreamControlNode(codeError), { kind: 'stream_error_code', code: 500 })

    const ackError: BinaryNode = {
        tag: WA_STREAM_SIGNALING.STREAM_ERROR_TAG,
        attrs: {},
        content: [{ tag: WA_STREAM_SIGNALING.ACK_TAG, attrs: { id: 'abc' } }]
    }
    assert.deepEqual(parseStreamControlNode(ackError), { kind: 'stream_error_ack', id: 'abc' })
})

test('success attribute parser decodes numbers and companion bytes', () => {
    const companion = new Uint8Array([1, 2, 3])
    const successNode: BinaryNode = {
        tag: 'success',
        attrs: {
            lid: '123@lid',
            display_name: 'Vinicius',
            companion_enc_static: bytesToBase64(companion),
            t: '100',
            props: '2',
            abprops: '3',
            location: 'br',
            creation: '99'
        }
    }

    const parsed = parseSuccessPersistAttributes(successNode)
    assert.equal(parsed.meLid, '123@lid')
    assert.equal(parsed.meDisplayName, 'Vinicius')
    assert.deepEqual(parsed.companionEncStatic, companion)
    assert.equal(parsed.lastSuccessTs, 100)
    assert.equal(parsed.propsVersion, 2)
    assert.equal(parsed.abPropsVersion, 3)
    assert.equal(parsed.connectionLocation, 'br')
    assert.equal(parsed.accountCreationTs, 99)
})

test('companion parser returns undefined and reports invalid payload', () => {
    const messages: string[] = []
    const parsed = parseCompanionEncStatic('$$$', (error) => {
        messages.push(error.message)
    })

    assert.equal(parsed, undefined)
    assert.equal(messages.length, 1)
})
