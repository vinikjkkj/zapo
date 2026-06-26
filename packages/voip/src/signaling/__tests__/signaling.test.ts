import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallState, EndCallReason } from '../../types.js'
import {
    buildRejectStanza,
    buildRelaylatencyForwardStanza,
    buildTerminateStanza,
    extractNodeInfo,
    extractRelayEndpoints,
    generateCallId,
    generateCallStanzaId,
    needsDecryption
} from '../signaling.js'

test('generateCallId / generateCallStanzaId produce 32-char uppercase hex', () => {
    for (const id of [generateCallId(), generateCallStanzaId()]) {
        assert.match(id, /^[0-9A-F]{32}$/)
    }
})

test('buildTerminateStanza targets the peer device JID with a terminate payload', () => {
    const node = buildTerminateStanza('12345:7@s.whatsapp.net', 'CALLID', '12345@s.whatsapp.net')
    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345:7@s.whatsapp.net')
    const inner = (
        node.content as unknown as Array<{ tag: string; attrs: Record<string, string> }>
    )[0]
    assert.equal(inner.tag, 'terminate')
    assert.equal(inner.attrs['call-id'], 'CALLID')
})

test('buildRejectStanza emits a reject payload', () => {
    const node = buildRejectStanza('12345@lid', 'CALLID', '12345@lid')
    const inner = (node.content as unknown as Array<{ tag: string }>)[0]
    assert.equal(inner.tag, 'reject')
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

test('buildTerminateStanza includes reason and duration attributes', () => {
    const node = buildTerminateStanza('p:0@lid', 'CID', 'creator@lid', 1500, 'accepted_elsewhere')
    const inner = (node.content as BinaryNode[])[0]
    assert.equal(inner.attrs.reason, 'accepted_elsewhere')
    assert.equal(inner.attrs.duration, '1500')
    assert.equal(inner.attrs.audio_duration, '1500')
})

test('buildRelaylatencyForwardStanza wraps te nodes and destinations under the user jid', () => {
    const teNodes: BinaryNode[] = [{ tag: 'te', attrs: { latency: '1' }, content: undefined }]
    const node = buildRelaylatencyForwardStanza(
        '12345:7@s.whatsapp.net',
        'CID',
        'creator@lid',
        teNodes,
        ['a@lid', 'b@lid']
    )

    assert.equal(node.tag, 'call')
    assert.equal(node.attrs.to, '12345@s.whatsapp.net')

    const relaylatency = (node.content as BinaryNode[])[0]
    assert.equal(relaylatency.tag, 'relaylatency')
    assert.equal(relaylatency.attrs['call-id'], 'CID')

    const children = relaylatency.content as BinaryNode[]
    assert.equal(children[0].tag, 'te')
    const destination = children[children.length - 1]
    assert.equal(destination.tag, 'destination')
    assert.deepEqual(
        (destination.content as BinaryNode[]).map((child) => child.attrs.jid),
        ['a@lid', 'b@lid']
    )
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
    assert.equal(info.peerPlatform, 'web')
})

test('extractNodeInfo returns null when there is no inner node', () => {
    assert.equal(extractNodeInfo({ tag: 'call', attrs: {}, content: undefined }), null)
})

test('extractRelayEndpoints collects direct and wrapped relays sorted by rtt', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            {
                tag: 'relay',
                attrs: { ip: '1.1.1.1', port: '3480', token: 't1', 'c2r-rtt': '50' },
                content: undefined
            },
            {
                tag: 'relays',
                attrs: {},
                content: [
                    {
                        tag: 'relay',
                        attrs: { ip: '2.2.2.2', port: '3481', token: 't2', 'c2r-rtt': '10' },
                        content: undefined
                    }
                ]
            }
        ]
    }

    const relays = extractRelayEndpoints(node)
    assert.equal(relays.length, 2)
    assert.equal(relays[0].ip, '2.2.2.2')
    assert.equal(relays[0].port, 3481)
    assert.equal(relays[1].ip, '1.1.1.1')
})

test('extractRelayEndpoints drops relays missing ip or token', () => {
    const node: BinaryNode = {
        tag: 'transport',
        attrs: {},
        content: [
            { tag: 'relay', attrs: { ip: '1.1.1.1' }, content: undefined },
            { tag: 'relay', attrs: { token: 'only-token' }, content: undefined }
        ]
    }
    assert.deepEqual(extractRelayEndpoints(node), [])
})
