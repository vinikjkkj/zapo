import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { NativeCallManager } from '../call-manager.js'
import { CallInfo } from '../call-state.js'
import { CallMediaType, CallState } from '../types.js'
import type { VoipSocket } from '../voip-socket.js'

function createMockSocket(): { sock: VoipSocket; sent: BinaryNode[] } {
    const sent: BinaryNode[] = []
    const sock: VoipSocket = {
        authState: {
            creds: {
                me: { id: '1111111111@lid', lid: '1111111111@lid' }
            }
        },
        user: { lid: '1111111111@lid' },
        sendNode: async (node) => {
            sent.push(node)
        },
        query: async () => undefined,
        signalRepository: {
            encryptMessage: async () => ({
                type: 'msg',
                ciphertext: new Uint8Array([1, 2, 3])
            }),
            decryptMessage: async () => new Uint8Array([1, 2, 3])
        },
        assertSessions: async () => undefined,
        getUSyncDevices: async () => [{ jid: '2222222222:0@lid' }],
        createParticipantNodes: async () => ({
            nodes: [],
            shouldIncludeDeviceIdentity: false
        })
    }

    return { sock, sent }
}

function buildOfferNode(callId: string, from = '2222222222:0@lid'): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'OFFERMSGID' },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': callId,
                    'call-creator': from
                },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined }
                ]
            }
        ]
    }
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

test('NativeCallManager rejects invalid maxConcurrentCalls', () => {
    const { sock } = createMockSocket()
    assert.throws(
        () => new NativeCallManager({ sock, maxConcurrentCalls: 0 }),
        /maxConcurrentCalls must be an integer >= 1/
    )
})

test('startCall blocks when maxConcurrentCalls is reached', async () => {
    const { sock } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 1 })

    await manager.startCall({ peerJid: '2222222222@lid' })

    await assert.rejects(
        () => manager.startCall({ peerJid: '3333333333@lid' }),
        /max concurrent calls reached \(1\)/
    )
})

test('startCall allows parallel calls when maxConcurrentCalls > 1', async () => {
    const { sock } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 2 })

    const callIdA = await manager.startCall({ peerJid: '2222222222@lid' })
    const callIdB = await manager.startCall({ peerJid: '3333333333@lid' })

    assert.notEqual(callIdA, callIdB)
    assert.equal(manager.getCalls().length, 2)
})

test('incoming offer at capacity is tracked with canAccept false', async () => {
    const { sock, sent } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 1 })

    await manager.startCall({ peerJid: '2222222222@lid' })
    const before = sent.length

    const incomingCallId = 'INCOMINGCALL0000000000000001'
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
    const { sock, sent } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 1 })

    const activeCallId = await manager.startCall({ peerJid: '2222222222@lid' })
    const incomingCallId = 'INCOMINGCALL0000000000000003'

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
    const { sock } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 2 })

    await manager.startCall({ peerJid: '2222222222@lid' })

    await manager.handleCallOffer(
        buildOfferNode('INCOMINGCALL0000000000000002'),
        '3333333333:0@lid'
    )

    assert.equal(manager.getCalls().length, 2)
})

test('handleCallTerminate only ends the matching call', async () => {
    const { sock } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 2 })

    const callIdA = await manager.startCall({ peerJid: '2222222222@lid' })
    const callIdB = await manager.startCall({ peerJid: '3333333333@lid' })

    await manager.handleCallTerminate(buildTerminateNode(callIdA))

    assert.equal(manager.getCall(callIdA), null)
    assert.ok(manager.getCall(callIdB))
    assert.equal(manager.getCall(callIdB)!.stateData.state, CallState.Ringing)
})

test('getCurrentCall returns the sole active call only', () => {
    const { sock } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 2 })

    const infoA = CallInfo.newOutgoing(
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        'a@lid',
        'me@lid',
        CallMediaType.Audio
    )
    const infoB = CallInfo.newOutgoing(
        'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        'b@lid',
        'me@lid',
        CallMediaType.Audio
    )
    infoA.applyTransition({ type: 'offer_sent' })
    infoB.applyTransition({ type: 'offer_sent' })
    ;(manager as unknown as { createSession: (info: CallInfo) => unknown }).createSession(infoA)
    ;(manager as unknown as { createSession: (info: CallInfo) => unknown }).createSession(infoB)

    assert.equal(manager.getCurrentCall(), null)
    assert.equal(manager.getCalls().length, 2)
})

test('call:inbound_audio event includes CallInfo', async () => {
    const { sock } = createMockSocket()
    const manager = new NativeCallManager({ sock, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)

    let receivedCall: CallInfo | null = null
    manager.on('call:inbound_audio', (info) => {
        receivedCall = info
    })

    manager.emit('call:inbound_audio', call, new Float32Array(960))
    assert.equal(receivedCall, call)
})
