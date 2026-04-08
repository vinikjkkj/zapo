import assert from 'node:assert/strict'
import test from 'node:test'

import { buildSuccessNode } from '../success-node'

test('builds a minimal success node with default attrs', () => {
    const node = buildSuccessNode({ t: 1_700_000_000, props: 5 })
    assert.equal(node.tag, 'success')
    assert.equal(node.attrs.t, '1700000000')
    assert.equal(node.attrs.props, '5')
    assert.equal(node.attrs.companion_enc_static, 'NULL')
    assert.equal(Object.prototype.hasOwnProperty.call(node.attrs, 'lid'), false)
})

test('includes optional attrs when provided', () => {
    const node = buildSuccessNode({
        t: 1_700_000_000,
        props: 5,
        lid: '5511999999999@lid',
        displayName: 'tester',
        abprops: 42,
        groupAbprops: 7,
        location: 'br',
        creation: 1_600_000_000
    })
    assert.equal(node.attrs.lid, '5511999999999@lid')
    assert.equal(node.attrs.display_name, 'tester')
    assert.equal(node.attrs.abprops, '42')
    assert.equal(node.attrs.group_abprops, '7')
    assert.equal(node.attrs.location, 'br')
    assert.equal(node.attrs.creation, '1600000000')
})

test('passing companionEncStatic null falls back to literal NULL', () => {
    const node = buildSuccessNode({ companionEncStatic: null })
    assert.equal(node.attrs.companion_enc_static, 'NULL')
})

test('passing companionEncStatic as base64 string is preserved', () => {
    const node = buildSuccessNode({ companionEncStatic: 'AQID' })
    assert.equal(node.attrs.companion_enc_static, 'AQID')
})
