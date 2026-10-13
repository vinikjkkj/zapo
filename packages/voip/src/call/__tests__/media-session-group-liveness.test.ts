import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { WaVoipSettings } from '../../signaling/voip-settings.js'
import { type WaCallGroupParticipant } from '../group-participants.js'

import {
    activeGroupSession,
    CALL_KEY,
    CONNECTED,
    createSession,
    FOURTH,
    groupUpdate,
    ID,
    innerOf,
    offerRelayData,
    PEER_DEVICE,
    sentWithTag,
    THIRD,
    THIRD_KEY,
    THREE_WAY,
    toRoster
} from './_group-session.js'

test('a member unheard for 20 s is reported invisible once, never when nobody is heard', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const senderOf = (device: string) =>
        [...harness.call.groupSenders].find(([, jid]) => jid === device)?.[0] as string
    const sweep = () =>
        (
            harness.session as unknown as { liveness: { sweepInvisibleSenders(): void } }
        ).liveness.sweepInvisibleSenders()

    // Nobody heard: our own path is down, nobody is accused.
    sweep()
    harness.clock.now += 25_000
    sweep()
    assert.deepEqual(sentWithTag(harness, 'peer_state'), [])

    // One device of PEER heard: PEER is on the call, whatever its other device does.
    harness.session.handleSenderMedia(senderOf(PEER_DEVICE), true)
    sweep()
    harness.clock.now += 21_000
    sweep()
    sweep()

    const reports = sentWithTag(harness, 'peer_state')
    assert.equal(reports.length, 1, 'once')
    assert.equal(reports[0].attrs.to, `${ID}@call`)
    const report = innerOf(reports[0])
    assert.equal(report.attrs['call-id'], ID)
    assert.match(report.attrs.t, /^\d+$/)
    assert.deepEqual(
        (report.content as BinaryNode[]).map((user) => user.attrs),
        [{ state: 'invisible', jid: THIRD }]
    )
    assert.deepEqual(harness.events, [['participant_media', PEER_DEVICE, true]])
})

test('a member heard again can be reported again later', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const senderOf = (device: string) =>
        [...harness.call.groupSenders].find(([, jid]) => jid === device)?.[0] as string
    const sweep = () =>
        (
            harness.session as unknown as { liveness: { sweepInvisibleSenders(): void } }
        ).liveness.sweepInvisibleSenders()
    harness.session.handleSenderMedia(senderOf(PEER_DEVICE), true)

    sweep()
    harness.clock.now += 21_000
    sweep()
    harness.session.handleSenderMedia(senderOf(THIRD_KEY), true)
    harness.session.handleSenderMedia(senderOf(THIRD_KEY), false)
    harness.clock.now += 19_000
    sweep()
    assert.equal(sentWithTag(harness, 'peer_state').length, 1, 'not yet: silent for 19 s')
    harness.clock.now += 2_000
    sweep()
    assert.equal(sentWithTag(harness, 'peer_state').length, 2)
})

test('a member reported invisible who left from a companion device is reported again on return', async () => {
    const MEMBER = '555555555555@lid'
    const MEMBER_DEVICE = '555555555555:3@lid'
    const withMember: readonly WaCallGroupParticipant[] = [
        ...THREE_WAY.slice(0, 2),
        { jid: MEMBER, devices: [MEMBER_DEVICE], state: CONNECTED }
    ]
    const harness = await activeGroupSession({ composition: withMember })
    await harness.session.applyCallKey(CALL_KEY, 1)
    const senderOf = (device: string) =>
        [...harness.call.groupSenders].find(([, jid]) => jid === device)?.[0] as string
    const sweep = () =>
        (
            harness.session as unknown as { liveness: { sweepInvisibleSenders(): void } }
        ).liveness.sweepInvisibleSenders()
    const reported = () =>
        sentWithTag(harness, 'peer_state').map(
            (node) => (innerOf(node).content as BinaryNode[])[0].attrs.jid
        )
    harness.session.handleSenderMedia(senderOf(PEER_DEVICE), true)

    sweep()
    harness.clock.now += 21_000
    sweep()
    assert.deepEqual(reported(), [MEMBER])

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 5, roster: toRoster(withMember.slice(0, 2)) })
    )
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 6, roster: toRoster(withMember) })
    )
    sweep()
    harness.clock.now += 21_000
    sweep()
    assert.deepEqual(reported(), [MEMBER, MEMBER])
})

test('a group call sends the call a heartbeat every 10 s from the accept, and stops at the end', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const harness = await createSession({ relayData: offerRelayData() })
    const heartbeats = () => sentWithTag(harness, 'heartbeat')

    await harness.session.acceptCall()
    assert.equal(heartbeats().length, 1)
    assert.equal(heartbeats()[0].attrs.to, `${ID}@call`)
    assert.deepEqual(innerOf(heartbeats()[0]).attrs, { 'call-id': ID, 'call-creator': PEER_DEVICE })

    t.mock.timers.tick(10_000)
    t.mock.timers.tick(10_000)
    assert.equal(heartbeats().length, 3)

    // Media going active does not start a second timer.
    harness.link.events.onActive()
    t.mock.timers.tick(10_000)
    assert.equal(heartbeats().length, 4)

    await harness.session.leaveCall()
    t.mock.timers.tick(30_000)
    assert.equal(heartbeats().length, 4)
})

test('the heartbeat follows the server interval, and stops when the call is ended for us', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const harness = await createSession({ relayData: offerRelayData() })
    harness.session.applyVoipSettings(
        WaVoipSettings.fromJson(JSON.stringify({ options: { heartbeat_interval_s: '5' } }))
    )

    await harness.session.acceptCall()
    t.mock.timers.tick(5_000)
    assert.equal(sentWithTag(harness, 'heartbeat').length, 2)

    // The manager ending the call here (user_invisible) runs the session's cleanup.
    harness.session.cleanup()
    t.mock.timers.tick(60_000)
    assert.equal(sentWithTag(harness, 'heartbeat').length, 2)
})

test('a 1:1 call sends no heartbeat', async (t) => {
    t.mock.timers.enable({ apis: ['setInterval'] })
    const harness = await createSession({ group: false, relayData: offerRelayData() })
    harness.call.encryptionKey = CALL_KEY

    await harness.session.acceptCall()
    harness.link.events.onActive()
    t.mock.timers.tick(30_000)

    assert.deepEqual(sentWithTag(harness, 'heartbeat'), [])
})

test('a connected member listed with no device is never reported invisible', async () => {
    const harness = await activeGroupSession({
        composition: [...THREE_WAY, { jid: FOURTH, devices: [], state: CONNECTED }]
    })
    await harness.session.applyCallKey(CALL_KEY, 1)
    const peerSender = [...harness.call.groupSenders].find(([, jid]) => jid === PEER_DEVICE)?.[0]
    harness.session.handleSenderMedia(peerSender as string, true)
    harness.session.handleSenderMedia(
        [...harness.call.groupSenders].find(([, jid]) => jid === THIRD_KEY)?.[0] as string,
        true
    )
    ;(
        harness.session as unknown as { liveness: { sweepInvisibleSenders(): void } }
    ).liveness.sweepInvisibleSenders()

    assert.deepEqual(sentWithTag(harness, 'peer_state'), [])
})
