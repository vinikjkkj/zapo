import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode } from '../../../transport/codec'
import { buildChatstate } from '../chatstate'
import { buildIncomingErrorStanza } from '../error-stanza'
import { buildIncomingPresence } from '../presence'

function firstChild(node: BinaryNode): BinaryNode {
    if (!Array.isArray(node.content) || node.content.length === 0) {
        throw new Error('expected node with at least one child')
    }
    return node.content[0]
}

test('buildIncomingPresence defaults to type=available without last', () => {
    const node = buildIncomingPresence({ from: '5511999999999@s.whatsapp.net' })
    assert.equal(node.tag, 'presence')
    assert.equal(node.attrs.from, '5511999999999@s.whatsapp.net')
    assert.equal(node.attrs.type, 'available')
    assert.equal(node.attrs.last, undefined)
})

test('buildIncomingPresence carries unavailable + numeric last as string', () => {
    const node = buildIncomingPresence({
        from: '5511999999999@s.whatsapp.net',
        type: 'unavailable',
        last: 1_700_000_000
    })
    assert.equal(node.attrs.type, 'unavailable')
    assert.equal(node.attrs.last, '1700000000')
})

test('buildIncomingPresence carries unavailable + sentinel last as-is', () => {
    const node = buildIncomingPresence({
        from: '5511999999999@s.whatsapp.net',
        type: 'unavailable',
        last: 'deny'
    })
    assert.equal(node.attrs.last, 'deny')
})

test('buildChatstate composing without media has empty composing child', () => {
    const node = buildChatstate({
        from: '5511999999999@s.whatsapp.net',
        state: { kind: 'composing' }
    })
    assert.equal(node.tag, 'chatstate')
    assert.equal(node.attrs.from, '5511999999999@s.whatsapp.net')
    const composing = firstChild(node)
    assert.equal(composing.tag, 'composing')
    assert.equal(composing.attrs.media, undefined)
})

test('buildChatstate composing with media=audio sets the inner attr', () => {
    const node = buildChatstate({
        from: '5511999999999@s.whatsapp.net',
        state: { kind: 'composing', media: 'audio' }
    })
    const composing = firstChild(node)
    assert.equal(composing.attrs.media, 'audio')
})

test('buildChatstate paused emits a <paused/> child', () => {
    const node = buildChatstate({
        from: '5511999999999@s.whatsapp.net',
        state: { kind: 'paused' }
    })
    const paused = firstChild(node)
    assert.equal(paused.tag, 'paused')
})

test('buildChatstate carries participant attribute when provided', () => {
    const node = buildChatstate({
        from: '12345@g.us',
        participant: '5511999999999@s.whatsapp.net',
        state: { kind: 'composing' }
    })
    assert.equal(node.attrs.from, '12345@g.us')
    assert.equal(node.attrs.participant, '5511999999999@s.whatsapp.net')
})

test('buildIncomingErrorStanza emits code as string', () => {
    const node = buildIncomingErrorStanza({ code: 503 })
    assert.equal(node.tag, 'error')
    assert.equal(node.attrs.code, '503')
    assert.equal(node.attrs.text, undefined)
    assert.equal(node.attrs.from, undefined)
})

test('buildIncomingErrorStanza carries optional text and from', () => {
    const node = buildIncomingErrorStanza({
        code: 401,
        text: 'unauthorized',
        from: 's.whatsapp.net'
    })
    assert.equal(node.attrs.code, '401')
    assert.equal(node.attrs.text, 'unauthorized')
    assert.equal(node.attrs.from, 's.whatsapp.net')
})
