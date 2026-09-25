import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallManager } from '../../call/WaCallManager.js'
import type { WaVoipDeps } from '../../types.js'
import { routeCallReceipt, routeCallStanza } from '../bridge.js'

function mocks() {
    const sent: BinaryNode[] = []
    const dispatched: string[] = []
    const deps = {
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            }
        }
    } as unknown as WaVoipDeps
    const manager = {
        handleCallOffer: async () => void dispatched.push('offer'),
        handleCallPreaccept: async () => void dispatched.push('preaccept'),
        handleCallAccept: async () => void dispatched.push('accept'),
        handleCallTransport: async () => void dispatched.push('transport'),
        handleCallTerminate: async () => void dispatched.push('terminate'),
        handleCallRelaylatency: async () => void dispatched.push('relaylatency'),
        handleCallMuteV2: async () => void dispatched.push('mute_v2'),
        handleCallUserAction: () => void dispatched.push('user_action'),
        handleCallRaiseHand: () => void dispatched.push('raise_hand'),
        handleRelayElection: () => void dispatched.push('relay_election'),
        handleCallScreenShare: () => void dispatched.push('screen_share'),
        handleCallVideoState: () => void dispatched.push('video')
    } as unknown as WaCallManager
    return { sent, dispatched, deps, manager }
}

function callNode(innerTag: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: '5511:0@lid', id: 'STANZA1' },
        content: [{ tag: innerTag, attrs: { 'call-id': 'CID' }, content: undefined }]
    }
}

test('routeCallStanza acks with class=call and dispatches the offer', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const tag = await routeCallStanza(manager, deps, callNode('offer'))

    assert.equal(tag, 'offer')
    assert.deepEqual(dispatched, ['offer'])
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'ack')
    assert.equal(sent[0].attrs.class, 'call')
    assert.equal(sent[0].attrs.type, 'offer')
    assert.equal(sent[0].attrs.id, 'STANZA1')
    assert.equal(sent[0].attrs.to, '5511:0@lid')
})

test('routeCallStanza routes each call tag to its handler', async () => {
    for (const tag of [
        'preaccept',
        'accept',
        'transport',
        'terminate',
        'relaylatency',
        'mute_v2',
        'user_action',
        'raise_hand',
        'video',
        'relay_election'
    ]) {
        const { dispatched, deps, manager } = mocks()
        await routeCallStanza(manager, deps, callNode(tag))
        assert.deepEqual(dispatched, [tag])
    }
})

/**
 * A raised hand arrives as one of two distinct message types, so each has to be
 * acked under its own type: a peer with its sender gate off sends the older
 * `raise_hand` and waits for `<ack class='call' type='raise_hand'>`. The nodes are
 * written out rather than built, so the check is that the router keys off the tag.
 */
test('routeCallStanza acks each raise-hand message type under its own type', async () => {
    const userAction: BinaryNode = {
        tag: 'call',
        attrs: { from: '5511:0@lid', id: 'STANZA3' },
        content: [
            {
                tag: 'user_action',
                attrs: { 'call-id': 'CID', 'call-creator': 'c@lid', action: 'raise_hand' },
                content: [{ tag: 'raise_hand', attrs: { 'raise-hand-state': '1' } }]
            }
        ]
    }
    const legacy: BinaryNode = {
        tag: 'call',
        attrs: { from: '5511:0@lid', id: 'STANZA4' },
        content: [
            {
                tag: 'raise_hand',
                attrs: { 'call-id': 'CID', 'call-creator': 'c@lid', 'raise-hand-state': '1' },
                content: undefined
            }
        ]
    }

    const modern = mocks()
    assert.equal(await routeCallStanza(modern.manager, modern.deps, userAction), 'user_action')
    assert.deepEqual(modern.dispatched, ['user_action'])
    assert.equal(modern.sent[0].attrs.class, 'call')
    assert.equal(modern.sent[0].attrs.type, 'user_action')
    assert.equal(modern.sent[0].attrs.id, 'STANZA3')

    const old = mocks()
    assert.equal(await routeCallStanza(old.manager, old.deps, legacy), 'raise_hand')
    assert.deepEqual(old.dispatched, ['raise_hand'])
    assert.equal(old.sent[0].attrs.class, 'call')
    assert.equal(old.sent[0].attrs.type, 'raise_hand')
    assert.equal(old.sent[0].attrs.id, 'STANZA4')
})

test('routeCallStanza routes both screen-share payloads to the same handler', async () => {
    for (const tag of ['screen_share', 'screen']) {
        const { dispatched, sent, deps, manager } = mocks()
        const routed = await routeCallStanza(manager, deps, callNode(tag))

        assert.equal(routed, tag)
        assert.deepEqual(dispatched, ['screen_share'])
        assert.equal(sent.length, 1)
        assert.equal(sent[0].attrs.class, 'call')
        assert.equal(sent[0].attrs.type, tag)
    }
})

test('routeCallStanza acks a video state stanza with type=video', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const tag = await routeCallStanza(manager, deps, callNode('video'))

    assert.equal(tag, 'video')
    assert.deepEqual(dispatched, ['video'])
    assert.equal(sent.length, 1)
    assert.equal(sent[0].tag, 'ack')
    assert.equal(sent[0].attrs.class, 'call')
    assert.equal(sent[0].attrs.type, 'video')
})

test('routeCallStanza ignores a call node with no inner child', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const tag = await routeCallStanza(manager, deps, {
        tag: 'call',
        attrs: { from: 'x@lid' },
        content: undefined
    })
    assert.equal(tag, null)
    assert.equal(sent.length, 0)
    assert.deepEqual(dispatched, [])
})

test('routeCallStanza acks but skips routing when the peer jid is malformed', async () => {
    const { sent, dispatched, deps, manager } = mocks()
    const node: BinaryNode = {
        tag: 'call',
        attrs: { from: '5:x@lid', id: 'STANZA2' },
        content: [{ tag: 'offer', attrs: {}, content: undefined }]
    }
    const tag = await routeCallStanza(manager, deps, node)

    assert.equal(tag, 'offer')
    assert.equal(sent.length, 1)
    assert.equal(sent[0].attrs.class, 'call')
    assert.deepEqual(dispatched, [])
})

test('routeCallReceipt acks receipt-class call tags and skips others', async () => {
    const receipt = (innerTag: string): BinaryNode => ({
        tag: 'receipt',
        attrs: { from: '5511:0@lid', id: 'R1', type: 'delivery' },
        content: [{ tag: innerTag, attrs: {}, content: undefined }]
    })

    const handled = mocks()
    assert.equal(await routeCallReceipt(handled.deps, receipt('offer')), true)
    assert.equal(handled.sent.length, 1)
    assert.equal(handled.sent[0].attrs.class, 'receipt')
    assert.equal(handled.sent[0].attrs.type, 'delivery')
    assert.equal(handled.sent[0].attrs.to, '5511:0@lid')
    assert.equal(handled.sent[0].attrs.id, 'R1')

    const skipped = mocks()
    assert.equal(await routeCallReceipt(skipped.deps, receipt('message')), false)
    assert.equal(skipped.sent.length, 0)
})
