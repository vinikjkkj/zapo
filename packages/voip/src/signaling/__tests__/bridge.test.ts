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
        handleRelayElection: () => void dispatched.push('relay_election')
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
        'relay_election'
    ]) {
        const { dispatched, deps, manager } = mocks()
        await routeCallStanza(manager, deps, callNode(tag))
        assert.deepEqual(dispatched, [tag])
    }
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
