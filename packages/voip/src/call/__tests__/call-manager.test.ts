import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallState, type WaVoipDeps, type WaVoipStores } from '../../types.js'
import { type CallInfo } from '../call-state.js'
import { WaCallManager } from '../WaCallManager.js'

function createMockDeps(): { deps: WaVoipDeps; stores: WaVoipStores; sent: BinaryNode[] } {
    const sent: BinaryNode[] = []
    const deps = {
        authClient: {
            getCurrentCredentials: () => ({
                meJid: '1111111111@lid',
                meLid: '1111111111@lid',
                signedIdentity: undefined
            })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            },
            query: async () => undefined
        },
        signalProtocol: {
            encryptMessage: async () => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) }),
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) })),
            decryptMessage: async () => new Uint8Array([1, 2, 3])
        },
        signalDeviceSync: {
            syncDeviceList: async () => [{ deviceJids: ['2222222222:0@lid'] }],
            queryLidsByPhoneJids: async () => []
        },
        messageDispatch: {
            syncSignalSession: async () => undefined
        },
        sessionResolver: {
            ensureSessionsBatch: async () => []
        }
    } as unknown as WaVoipDeps
    const stores = {
        privacyToken: { getByJid: async () => undefined }
    } as unknown as WaVoipStores

    return { deps, stores, sent }
}

function buildOfferNode(callId: string, from = '2222222222:0@lid', callerPn?: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'OFFERMSGID' },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': callId,
                    'call-creator': from,
                    ...(callerPn ? { caller_pn: callerPn } : {})
                },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined }
                ]
            }
        ]
    }
}

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

function buildAcceptNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'ACCEPTMSGID' },
        content: [
            {
                tag: 'accept',
                attrs: { 'call-id': callId, 'call-creator': from }
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

function findByInnerTag(nodes: readonly BinaryNode[], tag: string): BinaryNode[] {
    return nodes.filter((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return !!inner && typeof inner === 'object' && 'tag' in inner && inner.tag === tag
    })
}

function buildTerminateNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'TERMINATEMSGID' },
        content: [
            {
                tag: 'terminate',
                attrs: {
                    'call-id': callId,
                    'call-creator': from
                }
            }
        ]
    }
}

test('WaCallManager rejects invalid maxConcurrentCalls', () => {
    const { deps, stores } = createMockDeps()
    assert.throws(
        () => new WaCallManager({ deps, stores, maxConcurrentCalls: 0 }),
        /maxConcurrentCalls must be a positive safe integer/
    )
})

test('startCall blocks when maxConcurrentCalls is reached', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    await manager.startCall({ peerJid: '2222222222@lid' })

    await assert.rejects(
        () => manager.startCall({ peerJid: '3333333333@lid' }),
        /max concurrent calls reached \(1\)/
    )
})

test('startCall allows parallel calls when maxConcurrentCalls > 1', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    const callIdA = await manager.startCall({ peerJid: '2222222222@lid' })
    const callIdB = await manager.startCall({ peerJid: '3333333333@lid' })

    assert.notEqual(callIdA, callIdB)
    assert.equal(manager.getCalls().length, 2)
})

test('incoming offer at capacity is tracked with canAccept false', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    await manager.startCall({ peerJid: '2222222222@lid' })
    const before = sent.length

    const incomingCallId = 'CA11CA11000000000000000000000001'
    await manager.handleCallOffer(buildOfferNode(incomingCallId), '2222222222:0@lid')

    assert.equal(manager.getCalls().length, 2)
    const incoming = manager.getCall(incomingCallId)
    assert.ok(incoming)
    assert.equal(incoming.canAccept, false)
    assert.equal(incoming.isAcceptBlocked, true)

    const rejectNode = sent.slice(before).find((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return inner && typeof inner === 'object' && 'tag' in inner && inner.tag === 'reject'
    })
    assert.equal(rejectNode, undefined)

    const preacceptNode = sent.slice(before).find((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return inner && typeof inner === 'object' && 'tag' in inner && inner.tag === 'preaccept'
    })
    assert.equal(preacceptNode, undefined)

    await assert.rejects(() => manager.acceptCall(incomingCallId), /cannot be accepted/)
})

test('waiting incoming call unblocks when a slot frees', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const activeCallId = await manager.startCall({ peerJid: '2222222222@lid' })
    const incomingCallId = 'CA11CA11000000000000000000000003'

    await manager.handleCallOffer(buildOfferNode(incomingCallId), '3333333333:0@lid')
    assert.equal(manager.getCall(incomingCallId)!.canAccept, false)

    const beforeEnd = sent.length
    await manager.endCall(activeCallId)

    const incoming = manager.getCall(incomingCallId)
    assert.ok(incoming)
    assert.equal(incoming.canAccept, true)
    assert.equal(incoming.isAcceptBlocked, false)

    const preacceptNode = sent.slice(beforeEnd).find((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return inner && typeof inner === 'object' && 'tag' in inner && inner.tag === 'preaccept'
    })
    assert.ok(preacceptNode, 'expected preaccept after slot freed')
})

test('incoming offer with capacity creates a second session', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    await manager.startCall({ peerJid: '2222222222@lid' })

    await manager.handleCallOffer(
        buildOfferNode('CA11CA11000000000000000000000002'),
        '3333333333:0@lid'
    )

    assert.equal(manager.getCalls().length, 2)
})

test('incoming offer preserves the caller phone device jid', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    const callerPn = '5511999999999:3@s.whatsapp.net'
    const callId = 'CA11CA110000000000000000000000FE'

    await manager.handleCallOffer(
        buildOfferNode(callId, '2222222222:0@lid', callerPn),
        '2222222222:0@lid'
    )

    assert.equal(manager.getCall(callId)?.callerPn, callerPn)
})

test('handleCallTerminate only ends the matching call', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    const callIdA = await manager.startCall({ peerJid: '2222222222@lid' })
    const callIdB = await manager.startCall({ peerJid: '3333333333@lid' })

    await manager.handleCallTerminate(buildTerminateNode(callIdA))

    assert.equal(manager.getCall(callIdA), null)
    assert.ok(manager.getCall(callIdB))
    assert.equal(manager.getCall(callIdB)!.stateData.state, CallState.Ringing)
})

test('call_inbound_audio event includes CallInfo', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)

    let receivedCall: CallInfo | null = null
    manager.on('call_inbound_audio', (info) => {
        receivedCall = info
    })

    manager.emit('call_inbound_audio', call, new Float32Array(960))
    assert.equal(receivedCall, call)
})

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
        manager as unknown as { calls: Map<string, { announceInitialMuteState: () => void }> }
    ).calls.get(callId)
    assert.ok(session)

    const before = sent.length
    // The reference client sends a message of its own a fraction of a second after
    // the call goes active, carrying `mute-state="0"` with nobody having touched the
    // microphone. Both ends send one, whichever placed the call.
    session.announceInitialMuteState()
    await Promise.resolve()

    const announced = findByInnerTag(sent.slice(before), 'mute_v2')
    assert.equal(announced.length, 1)
    const inner = announced[0]?.content?.[0] as BinaryNode
    assert.equal(inner.attrs['mute-state'], '0')
    assert.equal(inner.attrs['call-id'], callId)

    // Sent once: a second transition to active must not restate it.
    session.announceInitialMuteState()
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
