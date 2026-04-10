import assert from 'node:assert/strict'
import test from 'node:test'

import {
    buildStreamErrorAck,
    buildStreamErrorCode,
    buildStreamErrorDeviceRemoved,
    buildStreamErrorReplaced,
    buildStreamErrorXmlNotWellFormed
} from '../stream-error'

test('builds <stream:error code="515"/>', () => {
    const node = buildStreamErrorCode(515)
    assert.equal(node.tag, 'stream:error')
    assert.equal(node.attrs.code, '515')
    assert.equal(node.content, undefined)
})

test('builds <stream:error code="516"/>', () => {
    const node = buildStreamErrorCode(516)
    assert.equal(node.attrs.code, '516')
})

test('builds <stream:error><conflict type="replaced"/>', () => {
    const node = buildStreamErrorReplaced()
    assert.equal(node.tag, 'stream:error')
    assert.ok(Array.isArray(node.content))
    const child = (node.content as { tag: string; attrs: Record<string, string> }[])[0]
    assert.equal(child.tag, 'conflict')
    assert.equal(child.attrs.type, 'replaced')
})

test('builds <stream:error><conflict type="device_removed"/>', () => {
    const node = buildStreamErrorDeviceRemoved()
    assert.ok(Array.isArray(node.content))
    const child = (node.content as { tag: string; attrs: Record<string, string> }[])[0]
    assert.equal(child.attrs.type, 'device_removed')
})

test('builds <stream:error><ack id="..."/>', () => {
    const node = buildStreamErrorAck('id-9')
    assert.ok(Array.isArray(node.content))
    const child = (node.content as { tag: string; attrs: Record<string, string> }[])[0]
    assert.equal(child.tag, 'ack')
    assert.equal(child.attrs.id, 'id-9')
})

test('builds <stream:error><xml-not-well-formed/>', () => {
    const node = buildStreamErrorXmlNotWellFormed()
    assert.ok(Array.isArray(node.content))
    const child = (node.content as { tag: string }[])[0]
    assert.equal(child.tag, 'xml-not-well-formed')
})
