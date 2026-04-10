import assert from 'node:assert/strict'
import test from 'node:test'

import type { BinaryNode } from '../../../transport/codec'
import { buildCall, buildFailure } from '../call-failure'
import { buildChatstate } from '../chatstate'
import { buildIncomingErrorStanza } from '../error-stanza'
import { buildGroupNotification, buildNotification } from '../notification'
import { buildIncomingPresence } from '../presence'
import { buildReceipt } from '../receipt'

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

test('buildReceipt requires id and from, omits type for delivery', () => {
    const node = buildReceipt({
        id: 'msg-1',
        from: '5511999999999@s.whatsapp.net'
    })
    assert.equal(node.tag, 'receipt')
    assert.equal(node.attrs.id, 'msg-1')
    assert.equal(node.attrs.from, '5511999999999@s.whatsapp.net')
    assert.equal(node.attrs.type, undefined)
})

test('buildReceipt sets type for non-delivery receipts and carries timestamps', () => {
    const node = buildReceipt({
        id: 'msg-9',
        from: '12345@g.us',
        type: 'read',
        t: 1_700_000_000,
        participant: '5511888888888@s.whatsapp.net'
    })
    assert.equal(node.attrs.type, 'read')
    assert.equal(node.attrs.t, '1700000000')
    assert.equal(node.attrs.participant, '5511888888888@s.whatsapp.net')
})

test('buildReceipt skips type when explicit delivery is passed', () => {
    const node = buildReceipt({
        id: 'msg-2',
        from: '5511999999999@s.whatsapp.net',
        type: 'delivery'
    })
    assert.equal(node.attrs.type, undefined)
})

test('buildNotification defaults from to s.whatsapp.net', () => {
    const node = buildNotification({ id: 'n-1', type: 'devices' })
    assert.equal(node.tag, 'notification')
    assert.equal(node.attrs.id, 'n-1')
    assert.equal(node.attrs.type, 'devices')
    assert.equal(node.attrs.from, 's.whatsapp.net')
})

test('buildNotification respects extraAttrs and content', () => {
    const node = buildNotification({
        id: 'n-2',
        type: 'picture',
        from: '5511999999999@s.whatsapp.net',
        t: 1_700_000_000,
        extraAttrs: { ['offline']: '1' },
        content: [{ tag: 'set', attrs: {} }]
    })
    assert.equal(node.attrs.from, '5511999999999@s.whatsapp.net')
    assert.equal(node.attrs.t, '1700000000')
    assert.equal(node.attrs.offline, '1')
    assert.equal(firstChild(node).tag, 'set')
})

test('buildGroupNotification sets type=w:gp2 and from=groupJid', () => {
    const node = buildGroupNotification({
        id: 'g-1',
        groupJid: '12345@g.us',
        participant: '5511999999999@s.whatsapp.net',
        children: [{ tag: 'add', attrs: {} }]
    })
    assert.equal(node.attrs.type, 'w:gp2')
    assert.equal(node.attrs.from, '12345@g.us')
    assert.equal(node.attrs.participant, '5511999999999@s.whatsapp.net')
    assert.equal(firstChild(node).tag, 'add')
})

test('buildCall constructs minimal call stanza', () => {
    const node = buildCall({
        id: 'call-1',
        from: '5511999999999@s.whatsapp.net'
    })
    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.id, 'call-1')
    assert.equal(node.attrs.from, '5511999999999@s.whatsapp.net')
    assert.equal(node.content, undefined)
})

test('buildCall carries to/timestamp and child offers', () => {
    const node = buildCall({
        id: 'call-2',
        from: '5511999999999@s.whatsapp.net',
        to: '5511888888888@s.whatsapp.net',
        t: 1_700_000_000,
        children: [{ tag: 'offer', attrs: { 'call-id': 'abc' } }]
    })
    assert.equal(node.attrs.to, '5511888888888@s.whatsapp.net')
    assert.equal(node.attrs.t, '1700000000')
    assert.equal(firstChild(node).tag, 'offer')
})

test('buildFailure carries reason and optional location', () => {
    const node = buildFailure({ reason: 'unavailable' })
    assert.equal(node.tag, 'failure')
    assert.equal(node.attrs.reason, 'unavailable')
    assert.equal(node.attrs.location, undefined)
})

test('buildFailure merges extraAttrs', () => {
    const node = buildFailure({
        reason: 'forbidden',
        location: 'middleware',
        extraAttrs: { code: '401' }
    })
    assert.equal(node.attrs.location, 'middleware')
    assert.equal(node.attrs.code, '401')
})
