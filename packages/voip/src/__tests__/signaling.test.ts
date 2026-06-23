import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    buildRejectStanza,
    buildTerminateStanza,
    createCallAck,
    generateCallId,
    generateCallStanzaId,
    needsDecryption
} from '../signaling.js'
import { CallState, EndCallReason } from '../types.js'

test('generateCallId / generateCallStanzaId produce 32-char uppercase hex', () => {
    for (const id of [generateCallId(), generateCallStanzaId()]) {
        assert.match(id, /^[0-9A-F]{32}$/)
    }
})

test('buildTerminateStanza targets a device-less JID with a terminate payload', () => {
    const node = buildTerminateStanza('12345:7@s.whatsapp.net', 'CALLID', '12345@s.whatsapp.net')
    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345@s.whatsapp.net')
    const inner = (node.content as Array<{ tag: string; attrs: Record<string, string> }>)[0]
    assert.equal(inner.tag, 'terminate')
    assert.equal(inner.attrs['call-id'], 'CALLID')
})

test('buildRejectStanza emits a reject payload', () => {
    const node = buildRejectStanza('12345@lid', 'CALLID', '12345@lid')
    const inner = (node.content as Array<{ tag: string }>)[0]
    assert.equal(inner.tag, 'reject')
})

test('createCallAck builds a class=call ack', () => {
    const ack = createCallAck('MSGID', '12345@lid', 'offer')
    assert.deepEqual(ack, {
        tag: 'ack',
        attrs: { id: 'MSGID', to: '12345@lid', class: 'call', type: 'offer' }
    })
})

test('needsDecryption only flags encrypted payload tags', () => {
    assert.equal(needsDecryption('accept'), true)
    assert.equal(needsDecryption('preaccept'), true)
    assert.equal(needsDecryption('offer'), false)
    assert.equal(needsDecryption('terminate'), false)
})

test('enums expose the documented call states', () => {
    assert.equal(CallState.Active, 'active')
    assert.equal(EndCallReason.UserEnded, 'user_ended')
})
