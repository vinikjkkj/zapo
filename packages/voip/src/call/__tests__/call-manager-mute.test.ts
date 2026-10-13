import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { type CallInfo } from '../call-state.js'
import { WaCallManager } from '../WaCallManager.js'

import {
    buildAcceptNode,
    buildOfferNode,
    createMockDeps,
    findByInnerTag
} from './_call-manager-fixtures.js'

function buildMuteV2Node(
    callId: string,
    attrs: Record<string, string>,
    from = '2222222222:0@lid'
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'MUTEMSGID' },
        content: [
            {
                tag: 'mute_v2',
                attrs: { 'call-id': callId, 'call-creator': from, ...attrs }
            }
        ]
    }
}

/**
 * Drives an outgoing call to the active state without any media, so a control
 * that is only allowed while the call is up can be exercised on its own.
 */
function forceActive(call: CallInfo): void {
    call.applyTransition({ type: 'remote_accepted' })
    call.applyTransition({ type: 'media_connected' })
}

test('setMute announces the new state to the peer, once per change', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)
    forceActive(call)

    const before = sent.length
    manager.setMute(callId, true)
    manager.setMute(callId, true)
    manager.setMute(callId, false)
    await Promise.resolve()

    const announcements = findByInnerTag(sent.slice(before), 'mute_v2')
    assert.equal(announcements.length, 2)

    assert.equal(announcements[0].attrs.to, '2222222222@lid')
    const first = (announcements[0].content as BinaryNode[])[0]
    assert.equal(first.attrs['call-id'], callId)
    assert.equal(first.attrs['call-creator'], '1111111111@lid')
    assert.equal(first.attrs['mute-state'], '1')

    const second = (announcements[1].content as BinaryNode[])[0]
    assert.equal(second.attrs['mute-state'], '0')

    assert.equal(call.stateData.audioMuted, false)
})

test('setMute on a call that is not active changes nothing and sends nothing', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const before = sent.length

    manager.setMute(callId, true)
    manager.setMute('NOSUCHCALL', true)

    assert.equal(findByInnerTag(sent.slice(before), 'mute_v2').length, 0)
    assert.equal(manager.getCall(callId)!.stateData.audioMuted, false)
})

test('the call announces its mute state once the media is connected', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const session = (
        manager as unknown as {
            calls: Map<string, { announcements: { announceInitialMute: () => void } }>
        }
    ).calls.get(callId)
    assert.ok(session)

    const before = sent.length
    // The reference client sends a message of its own a fraction of a second after
    // the call goes active, carrying `mute-state="0"` with nobody having touched the
    // microphone. Both ends send one, whichever placed the call.
    session.announcements.announceInitialMute()
    await Promise.resolve()

    const announced = findByInnerTag(sent.slice(before), 'mute_v2')
    assert.equal(announced.length, 1)
    const inner = announced[0]?.content?.[0] as BinaryNode
    assert.equal(inner.attrs['mute-state'], '0')
    assert.equal(inner.attrs['call-id'], callId)

    // Sent once: a second transition to active must not restate it.
    session.announcements.announceInitialMute()
    await Promise.resolve()
    assert.equal(findByInnerTag(sent.slice(before), 'mute_v2').length, 1)
})

test('neither side of an accept announces a mute state', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    const incomingCallId = 'CA11CA11000000000000000000000002'
    await manager.handleCallOffer(buildOfferNode(incomingCallId), '2222222222:0@lid')
    const beforeAccept = sent.length
    await manager.acceptCall(incomingCallId)
    assert.equal(findByInnerTag(sent.slice(beforeAccept), 'mute_v2').length, 0)

    const outgoingCallId = await manager.startCall({ peerJid: '3333333333@lid' })
    const beforeRemoteAccept = sent.length
    await manager.handleCallAccept(
        buildAcceptNode(outgoingCallId, '3333333333:0@lid'),
        '3333333333:0@lid'
    )
    assert.equal(findByInnerTag(sent.slice(beforeRemoteAccept), 'mute_v2').length, 0)
})

test('an inbound mute_v2 records the peer state and emits it without replying', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)
    assert.equal(call.stateData.peerAudioMuted, undefined)

    const observed: boolean[] = []
    manager.on('call_peer_mute', (_call, muted) => {
        observed.push(muted)
    })

    const before = sent.length
    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'mute-state': '1' }), '2222222222:0@lid')
    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'mute-state': '1' }), '2222222222:0@lid')
    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'mute-state': '0' }), '2222222222:0@lid')

    assert.deepEqual(observed, [true, false])
    assert.equal(call.stateData.peerAudioMuted, false)
    assert.equal(sent.length, before)
})

test('an inbound mute request is ignored on a 1:1 call', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    let fired = 0
    manager.on('call_peer_mute', () => {
        fired++
    })

    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'request-state': '1' }), '2222222222:0@lid')

    assert.equal(fired, 0)
    assert.equal(manager.getCall(callId)!.stateData.peerAudioMuted, undefined)
})

test('an inbound mute_v2 from another device of this account is ignored', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    let fired = 0
    manager.on('call_peer_mute', () => {
        fired++
    })

    manager.handleCallMuteV2(
        buildMuteV2Node(callId, { 'mute-state': '1' }, '1111111111:9@lid'),
        '1111111111:9@lid'
    )

    assert.equal(fired, 0)
    assert.equal(manager.getCall(callId)!.stateData.peerAudioMuted, undefined)
})
