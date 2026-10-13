import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { routeCallStanza } from '../../signaling/bridge.js'
import { CallMediaType, CallState, EndCallReason } from '../../types.js'
import { type CallInfo, WA_GROUP_CALL_ENDED_REASON } from '../call-state.js'

import {
    activeGroupCall,
    callNode,
    createManager,
    createMock,
    CREATOR,
    CREATOR_DEVICE,
    EVERYONE,
    GROUP_JID,
    groupOffer,
    innerOf,
    joinableGroupOffer,
    OTHER,
    OTHER_DEVICE,
    relayNode,
    rosterNode,
    sentInner,
    terminate
} from './_group-call-fixtures.js'

function groupUpdate(callId: string, content: BinaryNode[]): BinaryNode {
    return callNode(
        'group_update',
        `${callId}@call`,
        { 'call-id': callId, 'call-creator': CREATOR_DEVICE },
        content
    )
}

/** The server's terminate when the ring of a call that goes on is over: from the call, joinable, no reason. */
function ringOut(callId: string): BinaryNode {
    return terminate(callId, `${callId}@call`, { 'transaction-id': '17', joinable: '1' })
}

test('a group call declined goes to the call with count 0, and is followed until it ends', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('J1'), CREATOR_DEVICE)

    await manager.rejectCall('J1')

    const [reject] = sentInner(mock, 'reject')
    assert.equal(reject.attrs.to, 'J1@call')
    assert.equal(innerOf(reject).attrs.count, '0')
    const joinable = manager.getJoinableCall('J1')
    assert.equal(joinable?.cause, 'declined')
    assert.equal(joinable?.groupJid, GROUP_JID)
    assert.equal(joinable?.callCreator, CREATOR_DEVICE)

    await routeCallStanza(manager, mock.deps, ringOut('J1'))
    await routeCallStanza(
        manager,
        mock.deps,
        groupUpdate('J1', [relayNode('2'), rosterNode('21', { [CREATOR]: 'connected' })])
    )
    assert.equal(joinable?.rosterTransactionId, 21)
    assert.deepEqual(
        joinable?.participants?.map((participant) => participant.jid),
        [CREATOR]
    )
    assert.equal(joinable?.relayData?.selfPid, 2)
    assert.ok((joinable?.relayData?.endpoints.length ?? 0) > 0)

    await routeCallStanza(manager, mock.deps, groupUpdate('J1', [rosterNode('19', EVERYONE)]))
    assert.equal(joinable?.rosterTransactionId, 21, 'an older roster is not folded in')

    const events: string[] = []
    for (const event of ['call_state', 'call_ended', 'call_incoming'] as const) {
        manager.on(event, () => events.push(event))
    }
    await routeCallStanza(
        manager,
        mock.deps,
        terminate('J1', 'J1@call', { reason: WA_GROUP_CALL_ENDED_REASON })
    )
    assert.equal(manager.getJoinableCall('J1'), null)
    assert.deepEqual(events, [])
})

test('the server ending our ring stops it with nothing sent, and the call is kept to join', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const ended: CallInfo[] = []
    manager.on('call_ended', (call) => ended.push(call))
    await manager.handleCallOffer(joinableGroupOffer('R1'), CREATOR_DEVICE)

    await manager.handleCallTerminate(
        terminate('R1', OTHER_DEVICE, { joinable: '1' }),
        OTHER_DEVICE
    )
    assert.equal(manager.getCall('R1')?.isRinging, true, 'only the call itself ends our ring')

    const before = mock.sent.length
    await routeCallStanza(manager, mock.deps, ringOut('R1'))

    assert.equal(manager.getCall('R1'), null)
    assert.equal(ended.length, 1)
    assert.equal(ended[0].stateData.endReason, EndCallReason.Timeout)
    assert.deepEqual(
        mock.sent.slice(before).map((node) => node.tag),
        ['ack'],
        'no reject, no terminate: the call goes on'
    )
    assert.equal(manager.getJoinableCall('R1')?.cause, 'rung_out')

    await routeCallStanza(
        manager,
        mock.deps,
        groupUpdate('R1', [rosterNode('21', { ...EVERYONE, '1111111111@lid': 'invited' })])
    )
    assert.equal(manager.getJoinableCall('R1')?.rosterTransactionId, 21)
})

test('group_call_ended ends a group call that is still ringing', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('E1'), CREATOR_DEVICE)

    await routeCallStanza(
        manager,
        mock.deps,
        terminate('E1', 'E1@call', { reason: WA_GROUP_CALL_ENDED_REASON })
    )

    assert.equal(manager.getCall('E1'), null)
    assert.equal(manager.getJoinableCall('E1'), null)
})

/** The re-ring a participant's invite sends: same call id, `re-ring`, and no `<relay>`. */
function reRingOffer(callId: string): BinaryNode {
    return groupOffer(callId, { 'group-jid': GROUP_JID, joinable: '1', 're-ring': '1' })
}

test('a re-ring of a call declined here rings again as a new incoming call', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const incoming: CallInfo[] = []
    manager.on('call_incoming', (call) => incoming.push(call))
    await manager.handleCallOffer(joinableGroupOffer('RR'), CREATOR_DEVICE)
    await manager.rejectCall('RR')
    await routeCallStanza(manager, mock.deps, ringOut('RR'))

    await routeCallStanza(manager, mock.deps, reRingOffer('RR'))

    const call = manager.getCall('RR')
    assert.ok(call)
    assert.equal(call.stateData.state, CallState.IncomingRinging)
    assert.equal(call.relayData, undefined, 'a re-ring carries no relay')
    assert.equal(incoming.length, 2)
    assert.notEqual(incoming[1], incoming[0])
    assert.equal(manager.getJoinableCall('RR'), null, 'the new ring takes over')
})

test('a re-ring is not dropped by a terminate held for its call id', async () => {
    const mock = createMock()
    const manager = createManager(mock)

    await manager.handleCallTerminate(terminate('RH', OTHER_DEVICE), OTHER_DEVICE)
    await manager.handleCallOffer(reRingOffer('RH'), CREATOR_DEVICE)

    assert.equal(manager.getCall('RH')?.isRinging, true)
})

/** Everybody connected, ourselves included, as the roster the server sends a joiner. */
const ALL_CONNECTED = {
    '1111111111@lid': 'connected',
    [CREATOR]: 'connected',
    [OTHER]: 'connected'
}

test('a group call rung out here is joined with one accept to the call, then keyed and connected', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const incoming: CallInfo[] = []
    manager.on('call_incoming', (call) => incoming.push(call))
    await manager.handleCallOffer(joinableGroupOffer('JN'), CREATOR_DEVICE)
    await routeCallStanza(manager, mock.deps, ringOut('JN'))
    await routeCallStanza(
        manager,
        mock.deps,
        groupUpdate('JN', [rosterNode('21', { ...EVERYONE, '1111111111@lid': 'invited' })])
    )
    assert.equal(manager.getJoinableCall('JN')?.cause, 'rung_out')
    const states: string[] = []
    manager.on('call_state', (call) => states.push(call.stateData.state))
    const before = mock.sent.length

    await manager.joinCall('JN')

    const call = manager.getCall('JN')
    assert.ok(call)
    assert.equal(call.isGroupCall, true)
    assert.equal(call.groupJid, GROUP_JID)
    assert.equal(manager.getJoinableCall('JN'), null)
    assert.deepEqual(states, [CallState.Connecting])
    assert.equal(incoming.length, 1, 'joining is no new ring')

    const sent = mock.sent.slice(before)
    const accepts = sent.filter((node) => innerOf(node).tag === 'accept')
    assert.deepEqual(
        accepts.map((node) => node.attrs.to),
        ['JN@call']
    )
    const accept = innerOf(accepts[0])
    assert.deepEqual(accept.attrs, { 'call-id': 'JN', 'call-creator': CREATOR_DEVICE })
    const children = (accept.content as BinaryNode[]).map((child) => child.tag)
    assert.ok(children.includes('encopt'))
    assert.ok(!children.includes('enc'), 'the key comes later, over enc_rekey')
    assert.equal(
        sent.filter((node) => innerOf(node).tag === 'lobby').length,
        0,
        'the lobby is UI only'
    )

    // The server's ack carries no call-id, and the relay comes in the update to the joiner.
    await manager.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'accept', from: 'JN@call', id: 'ACCEPTMSGID' }
    })
    const rosterToJoiner = rosterNode('22', ALL_CONNECTED)
    await routeCallStanza(
        manager,
        mock.deps,
        groupUpdate('JN', [
            { tag: 'av_upgrade', attrs: { 'av-upgradable': '1' } },
            relayNode('2'),
            { ...rosterToJoiner, attrs: { ...rosterToJoiner.attrs, rekey: '1' } }
        ])
    )

    assert.ok((manager.getMediaSnapshot('JN')?.plan.relays?.endpoints.length ?? 0) > 0)
    assert.ok(sentInner(mock, 'enc_rekey').length > 0, 'the joiner keys the call')
    assert.equal(call.mediaType, CallMediaType.Audio, 'av-upgradable is no upgrade')

    manager.handleMediaEvent('JN', { type: 'active' })
    assert.equal(call.stateData.state, CallState.Active)
})

test('joining needs a group call this side was rung for, and only once', async () => {
    const mock = createMock()
    const manager = createManager(mock)

    await assert.rejects(() => manager.joinCall('NOPE'), /No joinable call with id NOPE/)

    await manager.handleCallOffer(joinableGroupOffer('J2'), CREATOR_DEVICE)
    await manager.rejectCall('J2')
    await manager.joinCall('J2')
    await assert.rejects(() => manager.joinCall('J2'), /No joinable call/)
})

test('a 1:1 offer marked joinable is no group call: no group ring-out, nothing to join', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const ended: CallInfo[] = []
    manager.on('call_ended', (call) => ended.push(call))
    const offer = (callId: string) =>
        callNode(
            'offer',
            CREATOR_DEVICE,
            { 'call-id': callId, 'call-creator': CREATOR_DEVICE, joinable: '1' },
            [{ tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }]
        )

    await manager.handleCallOffer(offer('P2'), CREATOR_DEVICE)
    assert.equal(manager.getCall('P2')?.isGroupCall, false)
    assert.deepEqual(
        sentInner(mock, 'preaccept').map((node) => node.attrs.to),
        [CREATOR_DEVICE]
    )
    await routeCallStanza(manager, mock.deps, ringOut('P2'))
    assert.equal(ended.length, 1)
    assert.notEqual(ended[0].stateData.endReason, EndCallReason.Timeout, 'ended as a 1:1 call')
    assert.equal(manager.getJoinableCall('P2'), null)

    await manager.handleCallOffer(offer('P3'), CREATOR_DEVICE)
    await manager.rejectCall('P3')
    const [reject] = sentInner(mock, 'reject')
    assert.equal(reject.attrs.to, CREATOR_DEVICE)
    assert.equal(innerOf(reject).attrs.count, undefined)
    assert.equal(manager.getJoinableCall('P3'), null)
    await assert.rejects(() => manager.joinCall('P3'), /No joinable call/)
})

/** The server taking a silent member off the call, as only that member receives it. */
function removedAsInvisible(callId: string): BinaryNode {
    return terminate(callId, `${callId}@call`, {
        'transaction-id': '28',
        reason: 'user_invisible',
        joinable: '1'
    })
}

test('the server taking this side off as invisible ends the call here, ready to join again', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const ended: CallInfo[] = []
    manager.on('call_ended', (call) => ended.push(call))
    const call = await activeGroupCall(mock, manager, 'IV')
    const before = mock.sent.length

    await routeCallStanza(manager, mock.deps, removedAsInvisible('IV'))

    assert.equal(call.isEnded, true)
    assert.equal(call.stateData.endReason, EndCallReason.Invisible)
    assert.deepEqual(ended, [call])
    assert.equal(manager.getCall('IV'), null)
    assert.deepEqual(
        mock.sent.slice(before).map((node) => node.tag),
        ['ack'],
        'nothing to tell the server: it already took us off'
    )
    assert.equal(manager.getJoinableCall('IV')?.cause, 'invisible')

    await routeCallStanza(
        manager,
        mock.deps,
        groupUpdate('IV', [rosterNode('28', { ...EVERYONE, '1111111111@lid': 'invited' })])
    )
    assert.equal(manager.getJoinableCall('IV')?.rosterTransactionId, 28)

    await manager.joinCall('IV')
    assert.deepEqual(
        sentInner(mock, 'accept').map((node) => node.attrs.to),
        ['IV@call', 'IV@call'],
        'the first accept, then the one joining again'
    )
})

test('user_invisible from a device is about somebody else and keeps the call', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const call = await activeGroupCall(mock, manager, 'IW')

    await routeCallStanza(
        manager,
        mock.deps,
        terminate('IW', OTHER_DEVICE, { reason: 'user_invisible', joinable: '1' })
    )

    assert.equal(call.isEnded, false)
    assert.equal(manager.getJoinableCall('IW'), null)
})

test('a joinable call keeps the relay of its newest update, and a join seeds that one', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('JR'), CREATOR_DEVICE)
    await manager.rejectCall('JR')
    const invited = { ...EVERYONE, '1111111111@lid': 'invited' }

    await routeCallStanza(
        manager,
        mock.deps,
        groupUpdate('JR', [relayNode('5'), rosterNode('30', invited)])
    )
    await routeCallStanza(
        manager,
        mock.deps,
        groupUpdate('JR', [relayNode('4'), rosterNode('29', invited)])
    )

    const joinable = manager.getJoinableCall('JR')
    assert.equal(joinable?.relayData?.selfPid, 5, 'the late, older relay is dropped')
    assert.equal(joinable?.relayTransactionId, 30)
    assert.equal(joinable?.rosterTransactionId, 30)

    await manager.joinCall('JR')
    assert.equal(manager.getCall('JR')?.relayData?.selfPid, 5)
})
