import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallMediaType, CallState, EndCallReason } from '../../types.js'
import { CallInfo } from '../call-state.js'

import {
    CONNECTED,
    createSession,
    GIG,
    GROUP_JID,
    groupUpdate,
    GRU,
    ID,
    innerOf,
    offerRelayData,
    PEER,
    PEER_DEVICE,
    PEER_SECOND_DEVICE,
    PLACED,
    placedGroupCall,
    relayDescriptor,
    relaysPublished,
    SELF,
    SELF_DEVICE,
    sentWithTag,
    SIN,
    THIRD_DEVICE,
    THREE_WAY,
    toRoster
} from './_group-session.js'

test('a group callee preaccepts and accepts to the call itself, with no key in hand', async () => {
    const harness = await createSession({ relayData: offerRelayData() })

    await harness.session.sendIncomingPreaccept(PEER_DEVICE)
    await harness.session.acceptCall()

    const [preaccept] = sentWithTag(harness, 'preaccept')
    assert.equal(preaccept.attrs.to, `${ID}@call`)
    assert.deepEqual(
        (innerOf(preaccept).content as BinaryNode[]).map((child) => child.tag),
        ['audio', 'encopt', 'capability']
    )
    const [accept] = sentWithTag(harness, 'accept')
    assert.ok(accept, 'an accept went out with no key')
    assert.equal(accept.attrs.to, `${ID}@call`)
    assert.ok((innerOf(accept).content as BinaryNode[]).some((child) => child.tag === 'encopt'))
})

test('on a group call we placed, an accept connects once and sends nothing back', async () => {
    const harness = await createSession({ direction: 'outgoing' })
    harness.call.applyTransition({ type: 'offer_sent' })
    const accept = (from: string): BinaryNode => ({
        tag: 'call',
        attrs: { from, id: 'ACCEPT' },
        content: [{ tag: 'accept', attrs: { 'call-id': ID, 'call-creator': SELF_DEVICE } }]
    })

    await harness.session.handleCallAccept(accept(PEER_DEVICE), PEER_DEVICE)
    await harness.session.handleCallAccept(accept(THIRD_DEVICE), THIRD_DEVICE)

    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.equal(harness.link.plan.accepted, true)
    assert.deepEqual(
        harness.sent.map((node) => [innerOf(node).tag, node.attrs.to]),
        [['heartbeat', `${ID}@call`]],
        'no terminate elsewhere, transport or receipt: only the heartbeat of a joined call'
    )
    assert.equal(harness.link.sections('keys').length, 0)
})

test('the caller of a group call sends no preaccept on the offer ack', async () => {
    const harness = await createSession({ direction: 'outgoing' })

    await harness.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': ID },
        content: [relayDescriptor({ selfPid: '0', relays: [SIN] })]
    })

    assert.equal(sentWithTag(harness, 'preaccept').length, 0)
})

test('leaving a group call sends one terminate to the call itself, with no reason', async () => {
    const harness = await createSession()
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    await harness.session.leaveCall()

    const terminates = sentWithTag(harness, 'terminate')
    assert.equal(terminates.length, 1)
    assert.equal(terminates[0].attrs.to, `${ID}@call`)
    const attrs = innerOf(terminates[0]).attrs
    assert.deepEqual(Object.keys(attrs), ['call-id', 'call-creator', 'duration', 'audio_duration'])
    assert.equal(attrs['call-id'], ID)
    assert.equal(attrs.duration, attrs.audio_duration)
    assert.equal(harness.call.isEnded, true)

    await harness.session.leaveCall()
    assert.equal(sentWithTag(harness, 'terminate').length, 1, 'nothing the second time')
})

test('ending a group call only takes us out: the same reason-less terminate as a leave', async () => {
    const harness = await createSession()

    await harness.session.endCall()

    const terminates = sentWithTag(harness, 'terminate')
    assert.deepEqual(
        terminates.map((node) => [node.attrs.to, innerOf(node).attrs.reason]),
        [[`${ID}@call`, undefined]]
    )
    assert.equal(harness.call.isEnded, true)
})

test('a group call leaves through the call itself, whatever its composition', async () => {
    const harness = await createSession({ composition: null })

    await harness.session.leaveCall()

    assert.deepEqual(
        sentWithTag(harness, 'terminate').map((node) => node.attrs.to),
        [`${ID}@call`]
    )
})

test('a group offer the server refuses ends with setup_failed, told to the call itself', async () => {
    const harness = await createSession({ direction: 'outgoing' })
    harness.call.applyTransition({ type: 'offer_sent' })

    await harness.session.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': ID, error: '400' }
    })

    assert.equal(harness.call.isEnded, true)
    assert.equal(harness.call.stateData.endReason, EndCallReason.SetupFailed)
    const terminates = sentWithTag(harness, 'terminate')
    assert.deepEqual(
        terminates.map((node) => [node.attrs.to, innerOf(node).attrs.reason]),
        [[`${ID}@call`, 'setup_failed']]
    )
    assert.equal(harness.link.stopped, true)
})

test('a 1:1 call cannot be left, only ended, and its hangup carries no reason', async () => {
    const harness = await createSession({ group: false })

    await assert.rejects(() => harness.session.leaveCall(), /not a group call/)
    assert.equal(harness.call.isEnded, false)

    await harness.session.endCall()
    const [terminate] = sentWithTag(harness, 'terminate')
    assert.equal(terminate.attrs.to, PEER_DEVICE)
    assert.equal(innerOf(terminate).attrs.reason, undefined)
})

test('a group call that loses its relay asks its owner to take it down', async () => {
    const harness = await createSession()

    harness.link.events.onRelayLost('legs_closed')

    assert.deepEqual(harness.ended, [EndCallReason.RelayLost])
})

test('a group call we placed connects from the roster, with no accept', async () => {
    const harness = await placedGroupCall()

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 8, roster: toRoster(PLACED) })
    )
    assert.equal(harness.call.stateData.state, CallState.Ringing, 'only we are connected yet')
    assert.notEqual(harness.link.plan.accepted, true)

    const joined = PLACED.map((entry) =>
        entry.jid === PEER ? { ...entry, state: CONNECTED } : entry
    )
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 13, roster: toRoster(joined) })
    )
    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.equal(harness.link.plan.accepted, true, 'the media starts')
    assert.equal(harness.states.filter((state) => state === CallState.Connecting).length, 1)

    // A second joiner moves nothing further, and an accept arriving late changes nothing.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 14,
            roster: toRoster(joined.map((entry) => ({ ...entry, state: CONNECTED })))
        })
    )
    await harness.session.handleCallAccept(
        {
            tag: 'call',
            attrs: { from: THIRD_DEVICE, id: 'ACCEPT' },
            content: [{ tag: 'accept', attrs: { 'call-id': ID, 'call-creator': SELF_DEVICE } }]
        },
        THIRD_DEVICE
    )
    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.equal(harness.link.sections('accepted').filter(Boolean).length, 1, 'joined once')
    assert.deepEqual(sentWithTag(harness, 'transport'), [])
})

test('ending a group call that connected tells the call how long we were on it', async () => {
    const harness = await placedGroupCall()
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster(
                PLACED.map((entry) => (entry.jid === PEER ? { ...entry, state: CONNECTED } : entry))
            )
        })
    )
    harness.link.events.onActive()
    assert.equal(harness.call.stateData.state, CallState.Active)

    await harness.session.endCall()

    const [terminate] = sentWithTag(harness, 'terminate')
    assert.equal(terminate.attrs.to, `${ID}@call`)
    const attrs = innerOf(terminate).attrs
    assert.deepEqual(Object.keys(attrs), ['call-id', 'call-creator', 'duration', 'audio_duration'])
    assert.equal(attrs.duration, attrs.audio_duration)
})

test('a group reject goes to the call itself with count 0', async () => {
    const harness = await createSession()

    await harness.session.rejectCall()

    const [reject] = sentWithTag(harness, 'reject')
    assert.equal(reject.attrs.to, `${ID}@call`)
    assert.equal(innerOf(reject).attrs.count, '0')
})

test('a joinable offer with no roster and no group jid, as WA Web offers every 1:1, is 1:1', async () => {
    const harness = await createSession({ group: false })
    harness.call.joinable = true

    await harness.session.sendIncomingPreaccept(PEER_DEVICE)

    assert.equal(harness.call.isGroupCall, false)
    const [preaccept] = sentWithTag(harness, 'preaccept')
    assert.equal(preaccept.attrs.to, PEER_DEVICE, 'to the caller device, not to the call')
})

test('a group call joined after its ring accepts to the call and takes its relay from the update', async () => {
    const info = CallInfo.newGroupJoin(ID, PEER_DEVICE, CallMediaType.Audio, GROUP_JID)
    const harness = await createSession({ info })
    harness.session.seedGroupJoin({
        participants: toRoster(THREE_WAY).map((entry) => ({
            jid: entry.jid,
            devices: entry.devices,
            state: entry.jid === SELF ? 'invited' : CONNECTED
        })),
        transactionId: 21
    })

    await harness.session.acceptCall()

    const [accept] = sentWithTag(harness, 'accept')
    assert.equal(accept.attrs.to, `${ID}@call`)
    assert.deepEqual(sentWithTag(harness, 'preaccept'), [], 'a join opens no ring of its own')
    assert.equal(harness.link.plan.relays, null)

    // The server answers the joiner with the roster, its relay, and the rekey to run.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 22,
            rekey: true,
            roster: toRoster(THREE_WAY),
            relay: relayDescriptor({ selfPid: '2', relays: [GRU, GIG] })
        })
    )

    assert.equal(relaysPublished(harness.link).at(-1)?.generation, 1)
    assert.deepEqual(
        sentWithTag(harness, 'enc_rekey').map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE]
    )
    assert.ok(harness.call.encryptionKey)
    assert.equal(harness.call.groupComposition?.lastTransactionId, 22)
})
