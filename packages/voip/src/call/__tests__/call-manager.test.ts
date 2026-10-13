import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { routeCallStanza } from '../../signaling/bridge.js'
import { CallState, EndCallReason } from '../../types.js'
import { type CallInfo } from '../call-state.js'
import { WaCallManager } from '../WaCallManager.js'

import {
    acceptRelayNode,
    buildAcceptNode,
    buildOfferAckNode,
    buildOfferNode,
    CALL_KEY_ENC_NODE,
    callIdOf,
    createMockDeps,
    findByInnerTag,
    holdCallKeyDecrypt,
    holdDeviceSync,
    settle,
    tagsSentFor
} from './_call-manager-fixtures.js'

/** The lifecycle events the app sees, in order, tagged with their call id. */
function recordCallEvents(manager: WaCallManager): string[] {
    const events: string[] = []
    for (const event of ['call_incoming', 'call_state', 'call_ended'] as const) {
        manager.on(event, (call: CallInfo) => events.push(`${event} ${call.callId}`))
    }
    return events
}

function buildTerminateNode(
    callId: string,
    from = '2222222222:0@lid',
    reason?: string
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'TERMINATEMSGID' },
        content: [
            {
                tag: 'terminate',
                attrs: {
                    'call-id': callId,
                    'call-creator': from,
                    ...(reason ? { reason } : {})
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

test('an incoming call settled on another device of this account keeps the terminate reason', async () => {
    const cases = [
        ['accepted_elsewhere', EndCallReason.AcceptedElsewhere],
        ['rejected_elsewhere', EndCallReason.RejectedElsewhere],
        [undefined, EndCallReason.UserEnded]
    ] as const
    for (const [reason, expected] of cases) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const callId = 'CA11CA11000000000000000000000010'
        await manager.handleCallOffer(buildOfferNode(callId), '2222222222:0@lid')
        const call = manager.getCall(callId)
        assert.ok(call)

        await manager.handleCallTerminate(buildTerminateNode(callId, undefined, reason))

        assert.equal(manager.getCall(callId), null)
        assert.equal(call.stateData.endReason, expected, `reason ${reason}`)
    }
})

test('accepted_elsewhere on a call this device placed stays an ordinary hang-up', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)

    await manager.handleCallTerminate(
        buildTerminateNode(callId, '2222222222:1@lid', 'accepted_elsewhere'),
        '2222222222:1@lid'
    )

    assert.equal(call.stateData.endReason, EndCallReason.UserEnded)
})

test('an accept on an incoming call ends it as accepted elsewhere and frees its slot', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    const answeredId = 'CA11CA11000000000000000000000020'
    const waitingId = 'CA11CA11000000000000000000000021'

    await manager.handleCallOffer(buildOfferNode(answeredId), '2222222222:0@lid')
    await manager.handleCallOffer(buildOfferNode(waitingId, '3333333333:0@lid'), '3333333333:0@lid')
    const answered = manager.getCall(answeredId)
    assert.ok(answered)
    assert.equal(manager.getCall(waitingId)!.canAccept, false)

    const before = sent.length
    // Another device of this account (1111111111) picked up the first call.
    await manager.handleCallAccept(
        buildAcceptNode(answeredId, '1111111111:1@lid', '2222222222:0@lid'),
        '1111111111:1@lid'
    )

    assert.equal(manager.getCall(answeredId), null)
    assert.equal(answered.stateData.endReason, EndCallReason.AcceptedElsewhere)
    assert.deepEqual(
        sent.slice(before).filter((node) => callIdOf(node) === answeredId),
        []
    )
    assert.equal(manager.getCall(waitingId)!.canAccept, true)
})

test('an incoming call ended while it is still being set up is never announced', async () => {
    for (const ending of ['accept', 'terminate'] as const) {
        const { deps, stores, sent } = createMockDeps()
        const release = holdDeviceSync(deps)
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const callId = 'CA11CA11000000000000000000000030'
        const announced: CallInfo[] = []
        manager.on('call_incoming', (call) => announced.push(call))

        const offer = manager.handleCallOffer(buildOfferNode(callId), '2222222222:0@lid')
        await settle()
        const call = manager.getCall(callId)
        assert.ok(call)
        if (ending === 'accept') {
            await manager.handleCallAccept(
                buildAcceptNode(callId, '1111111111:1@lid', '2222222222:0@lid'),
                '1111111111:1@lid'
            )
        } else {
            await manager.handleCallTerminate(buildTerminateNode(callId))
        }
        release()
        await offer

        assert.equal(manager.getCall(callId), null, ending)
        assert.equal(call.isEnded, true, ending)
        assert.deepEqual(announced, [], ending)
        assert.deepEqual(tagsSentFor(sent, callId), [], ending)
    }
})

test('a waiting call ended while its freed slot is being activated is never preaccepted', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    const activeCallId = await manager.startCall({ peerJid: '2222222222@lid' })
    const waitingId = 'CA11CA11000000000000000000000031'
    await manager.handleCallOffer(buildOfferNode(waitingId, '3333333333:0@lid'), '3333333333:0@lid')
    assert.equal(manager.getCall(waitingId)!.canAccept, false)

    const release = holdDeviceSync(deps)
    const freeing = manager.endCall(activeCallId)
    await settle()
    await manager.handleCallTerminate(buildTerminateNode(waitingId, '3333333333:0@lid'))
    release()
    await freeing

    assert.equal(manager.getCall(waitingId), null)
    assert.deepEqual(tagsSentFor(sent, waitingId), [])
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

test('a terminate from the caller ends an incoming call this device already accepted', async () => {
    const reasons = [
        ['accepted_elsewhere', EndCallReason.AcceptedElsewhere],
        ['rejected_elsewhere', EndCallReason.RejectedElsewhere],
        ['device_switch', EndCallReason.UserEnded],
        [undefined, EndCallReason.UserEnded]
    ] as const
    for (const caller of ['2222222222@lid', '2222222222:0@lid', '2222222222:5@lid']) {
        for (const [reason, expected] of reasons) {
            const label = `${caller} ${reason}`
            const { deps, stores } = createMockDeps()
            const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
            const callId = 'CA11CA11000000000000000000000040'
            await routeCallStanza(manager, deps, buildOfferNode(callId, caller))
            await manager.acceptCall(callId)
            const call = manager.getCall(callId)
            assert.ok(call, label)

            await routeCallStanza(manager, deps, buildTerminateNode(callId, caller, reason))

            assert.equal(manager.getCall(callId), null, label)
            assert.equal(call.stateData.endReason, expected, label)
        }
    }
})

test('on a call we placed, accepted_elsewhere is dropped only from a device other than the one that answered', async () => {
    for (const [terminateFrom, ends] of [
        ['2222222222@lid', true],
        ['2222222222:0@lid', true],
        ['2222222222:87@lid', false]
    ] as const) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        const callId = await manager.startCall({ peerJid: '2222222222@lid' })
        await manager.handleCallAck(
            buildOfferAckNode(callId, ['2222222222:0@lid', '2222222222:87@lid', '1111111111:3@lid'])
        )
        await routeCallStanza(
            manager,
            deps,
            buildAcceptNode(callId, '2222222222:0@lid', '1111111111@lid', [
                acceptRelayNode('2222222222:0@lid', '2')
            ])
        )

        await routeCallStanza(
            manager,
            deps,
            buildTerminateNode(callId, terminateFrom, 'accepted_elsewhere')
        )

        assert.equal(manager.getCall(callId) === null, ends, terminateFrom)
    }
})

test('a terminate that lands while the offer is still decrypting keeps the call from ever ringing', async () => {
    for (const reason of [undefined, 'rejected_elsewhere']) {
        const { deps, stores, sent } = createMockDeps()
        const release = holdCallKeyDecrypt(deps)
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const events = recordCallEvents(manager)
        const callId = 'CA11CA11000000000000000000000070'

        const offer = manager.handleCallOffer(
            buildOfferNode(callId, undefined, undefined, [CALL_KEY_ENC_NODE]),
            '2222222222@lid'
        )
        await settle()
        await manager.handleCallTerminate(
            buildTerminateNode(callId, undefined, reason),
            '2222222222@lid'
        )
        release()
        await offer

        assert.equal(manager.getCall(callId), null, reason)
        assert.deepEqual(events, [], reason)
        assert.deepEqual(tagsSentFor(sent, callId), [], reason)
    }
})

test('a terminate for an unknown call does not stop a different call from ringing', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    await manager.handleCallTerminate(
        buildTerminateNode('CA11CA11000000000000000000000071'),
        '2222222222@lid'
    )

    const callId = 'CA11CA11000000000000000000000072'
    await manager.handleCallOffer(buildOfferNode(callId), '2222222222@lid')

    assert.equal(manager.getCall(callId)?.stateData.state, CallState.IncomingRinging)
})

test('an accept from another account leaves an incoming call ringing', async () => {
    for (const from of ['3333333333@lid', '3333333333:4@lid', '2222222222:0@lid']) {
        const { deps, stores, sent } = createMockDeps()
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const events = recordCallEvents(manager)
        const callId = 'CA11CA11000000000000000000000080'
        await manager.handleCallOffer(buildOfferNode(callId), '2222222222@lid')
        events.length = 0
        const before = sent.length

        await routeCallStanza(manager, deps, buildAcceptNode(callId, from, '2222222222:0@lid'))

        assert.equal(manager.getCall(callId)?.stateData.state, CallState.IncomingRinging, from)
        assert.deepEqual(events, [], from)
        assert.deepEqual(tagsSentFor(sent.slice(before), callId), [], from)
    }
})

test('an accept from any device of this account, by pn or lid, ends an incoming call', async () => {
    const credentials = { meJid: '5511999990000:4@s.whatsapp.net', meLid: '1111111111:4@lid' }
    for (const from of [
        '1111111111@lid',
        '1111111111:2@lid',
        '5511999990000@s.whatsapp.net',
        '5511999990000:3@s.whatsapp.net'
    ]) {
        const { deps, stores } = createMockDeps(credentials)
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const callId = 'CA11CA11000000000000000000000081'
        await manager.handleCallOffer(buildOfferNode(callId), '2222222222@lid')
        const call = manager.getCall(callId)
        assert.ok(call, from)

        await routeCallStanza(manager, deps, buildAcceptNode(callId, from, '2222222222:0@lid'))

        assert.equal(manager.getCall(callId), null, from)
        assert.equal(call.stateData.endReason, EndCallReason.AcceptedElsewhere, from)
    }
})

test('an incoming call that ends before it is announced reports neither a state nor an end', async () => {
    for (const ending of ['accept', 'terminate'] as const) {
        const { deps, stores } = createMockDeps()
        const release = holdDeviceSync(deps)
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const events = recordCallEvents(manager)
        const callId = 'CA11CA11000000000000000000000090'

        const offer = manager.handleCallOffer(buildOfferNode(callId), '2222222222@lid')
        await settle()
        if (ending === 'accept') {
            await routeCallStanza(
                manager,
                deps,
                buildAcceptNode(callId, '1111111111:1@lid', '2222222222:0@lid')
            )
        } else {
            await routeCallStanza(manager, deps, buildTerminateNode(callId))
        }
        release()
        await offer

        assert.equal(manager.getCall(callId), null, ending)
        assert.deepEqual(events, [], ending)
    }
})

test('an offer the server refuses ends the call with setup_failed instead of ringing forever', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    const ended: CallInfo[] = []
    manager.on('call_ended', (call) => ended.push(call))
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    assert.equal(manager.getCall(callId)?.stateData.state, CallState.Ringing)

    await manager.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': callId, id: 'OFFERMSGID', error: '400' }
    })

    assert.equal(manager.getCall(callId), null)
    assert.equal(ended.length, 1)
    assert.equal(ended[0].stateData.endReason, EndCallReason.SetupFailed)
    const [terminate] = findByInnerTag(sent, 'terminate')
    assert.equal(terminate.attrs.to, '2222222222@lid')
    assert.deepEqual((terminate.content as BinaryNode[])[0].attrs, {
        'call-id': callId,
        'call-creator': '1111111111@lid',
        reason: 'setup_failed'
    })

    // The slot is free again.
    await manager.startCall({ peerJid: '3333333333@lid' })
})
