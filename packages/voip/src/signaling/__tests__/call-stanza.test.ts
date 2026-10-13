import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import {
    callIdOfCallServerJid,
    extractNodeInfo,
    generateCallId,
    generateCallStanzaId,
    toCallServerJid
} from '../call-stanza.js'

test('generateCallId / generateCallStanzaId produce 32-char uppercase hex', () => {
    for (const id of [generateCallId(), generateCallStanzaId()]) {
        assert.match(id, /^[0-9A-F]{32}$/)
    }
})

test('extractNodeInfo reads the inner call tag and ids', () => {
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: 'peer:0@lid', platform: 'web', version: '2.3' },
        content: [{ tag: 'offer', attrs: { 'call-id': 'CID' }, content: undefined }]
    }
    const info = extractNodeInfo(node)
    assert.ok(info)
    assert.equal(info.tag, 'offer')
    assert.equal(info.callId, 'CID')
    assert.equal(info.peerJid, 'peer:0@lid')
})

test('extractNodeInfo returns null when there is no inner node', () => {
    assert.equal(extractNodeInfo({ tag: 'call', attrs: {}, content: undefined }), null)
})

test('callIdOfCallServerJid reads the call a call address names, and nothing else', () => {
    assert.equal(callIdOfCallServerJid(toCallServerJid('00DF5A67')), '00DF5A67')
    assert.equal(callIdOfCallServerJid('50062877036657:87@lid'), null)
    assert.equal(callIdOfCallServerJid('@call'), null)
    assert.equal(callIdOfCallServerJid(undefined), null)
})
