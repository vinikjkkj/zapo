import assert from 'node:assert/strict'
import { test } from 'node:test'

import { resolveWamEnumValue, resolveWamEventFields, wamValueKind } from '../registry.js'

test('wamValueKind maps registry types to wire kinds', () => {
    assert.equal(wamValueKind('boolean'), 'bool')
    assert.equal(wamValueKind('integer'), 'int')
    assert.equal(wamValueKind('timer'), 'int')
    assert.equal(wamValueKind('enum'), 'int')
    assert.equal(wamValueKind('number'), 'float')
    assert.equal(wamValueKind('string'), 'string')
    assert.equal(wamValueKind('unknown'), null)
})

test('resolveWamEnumValue converts value keys to numeric ids', () => {
    assert.equal(resolveWamEnumValue('UI_ACTION_TYPE', 'CHAT_OPEN'), 3)
    assert.equal(resolveWamEnumValue('UI_ACTION_TYPE', 'NONEXISTENT'), null)
})

test('resolveWamEventFields resolves enums and types (registry field order)', () => {
    const fields = resolveWamEventFields('UiAction', {
        uiActionType: 'CHAT_OPEN',
        uiActionPreloaded: true,
        uiActionT: 142
    })
    assert.deepEqual(fields, [
        { id: 2, kind: 'bool', value: true },
        { id: 3, kind: 'int', value: 142 },
        { id: 1, kind: 'int', value: 3 }
    ])
})

test('resolveWamEventFields skips absent fields and unresolvable enum keys', () => {
    assert.deepEqual(resolveWamEventFields('UiAction', {}), [])
    assert.deepEqual(resolveWamEventFields('UiAction', { uiActionType: 'NOPE' }), [])
})

test('resolveWamEventFields drops non-integer / non-finite int fields', () => {
    assert.deepEqual(resolveWamEventFields('UiAction', { uiActionT: 3.14 }), [])
    assert.deepEqual(resolveWamEventFields('UiAction', { uiActionT: Number.NaN }), [])
    assert.deepEqual(resolveWamEventFields('UiAction', { uiActionT: Number.POSITIVE_INFINITY }), [])
    assert.deepEqual(resolveWamEventFields('UiAction', { uiActionT: 142 }), [
        { id: 3, kind: 'int', value: 142 }
    ])
})
