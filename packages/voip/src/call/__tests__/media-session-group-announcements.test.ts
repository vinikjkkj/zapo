import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    activeGroupSession,
    callStanza,
    CONNECTED,
    createSession,
    FOURTH,
    FOURTH_DEVICE,
    groupUpdate,
    ID,
    innerOf,
    PEER,
    PEER_DEVICE,
    PEER_SECOND_DEVICE,
    sentWithTag,
    THIRD_DEVICE,
    THIRD_KEY,
    THREE_WAY,
    toRoster
} from './_group-session.js'

test('a group mute is kept per device and reported with the device that muted', async () => {
    const harness = await activeGroupSession()

    harness.session.handleCallMuteV2(
        callStanza(PEER_DEVICE, 'mute_v2', { 'mute-state': '1' }),
        PEER_DEVICE
    )
    harness.session.handleCallMuteV2(
        callStanza(THIRD_KEY, 'mute_v2', { 'mute-state': '1' }),
        THIRD_KEY
    )
    harness.session.handleCallMuteV2(
        callStanza(PEER_DEVICE, 'mute_v2', { 'mute-state': '1' }),
        PEER_DEVICE
    )

    assert.deepEqual(
        harness.events.filter(([event]) => event === 'mute'),
        [
            ['mute', PEER_DEVICE, true],
            ['mute', THIRD_KEY, true]
        ]
    )
    assert.equal(harness.call.participantMedia.get(PEER_DEVICE)?.audioMuted, true)
    assert.equal(harness.call.participantMedia.get(THIRD_KEY)?.audioMuted, true)
    assert.equal(harness.call.stateData.peerAudioMuted, undefined, 'one peer is a 1:1 notion')
})

test('a mute request is reported with its raw state, and nothing is muted', async () => {
    const harness = await activeGroupSession()

    harness.session.handleCallMuteV2(
        callStanza(PEER_DEVICE, 'mute_v2', { 'request-state': '1' }),
        PEER_DEVICE
    )

    assert.deepEqual(harness.events, [['mute_requested', PEER_DEVICE, '1']])
    assert.equal(harness.call.stateData.audioMuted, false)
    assert.equal(harness.link.sections('muted').length, 0)
})

test('we ask a participant to mute at its device; somebody not on the call is refused', async () => {
    const harness = await activeGroupSession()

    await harness.session.requestParticipantMute(PEER)
    await harness.session.requestParticipantMute(THIRD_DEVICE)

    assert.deepEqual(
        sentWithTag(harness, 'mute_v2').map((node) => [node.attrs.to, innerOf(node).attrs]),
        [
            [PEER_DEVICE, { 'call-id': ID, 'call-creator': PEER_DEVICE, 'request-state': '1' }],
            [THIRD_KEY, { 'call-id': ID, 'call-creator': PEER_DEVICE, 'request-state': '1' }]
        ]
    )
    await assert.rejects(() => harness.session.requestParticipantMute('424242@lid'), /not on call/)

    const plain = await createSession({ group: false })
    await assert.rejects(() => plain.session.requestParticipantMute(PEER), /not a group call/)
})

test('our own mute and hand go to the call itself on a group call, to the peer on 1:1', async () => {
    const group = await activeGroupSession()
    group.session.setMute(true)
    await group.session.setHandRaised(true)
    assert.deepEqual(
        group.sent.map((node) => [innerOf(node).tag, node.attrs.to]),
        [
            ['mute_v2', `${ID}@call`],
            ['user_action', `${ID}@call`]
        ]
    )

    const plain = await activeGroupSession({ group: false })
    plain.session.setMute(true)
    await plain.session.setHandRaised(true)
    assert.deepEqual(
        plain.sent.map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_DEVICE]
    )
})

test('somebody arriving gets our mute state again, and our hand only while it is up', async () => {
    const harness = await activeGroupSession()
    harness.session.setMute(true)
    const sentBefore = harness.sent.length
    const afterJoin = () =>
        harness.sent
            .slice(sentBefore)
            .map((node) => [innerOf(node).tag, node.attrs.to, innerOf(node).attrs['mute-state']])

    const fourWay = [...THREE_WAY, { jid: FOURTH, devices: [FOURTH_DEVICE], state: 'outgoing' }]
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 5, roster: toRoster(fourWay) })
    )
    assert.deepEqual(afterJoin(), [['mute_v2', `${ID}@call`, '1']])

    // The same roster again brings nobody.
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 6, roster: toRoster(fourWay) })
    )
    assert.equal(afterJoin().length, 1)

    // Hand up, and the newcomer connects: both go out again.
    await harness.session.setHandRaised(true)
    const connected = fourWay.map((entry) => ({ ...entry, state: CONNECTED }))
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 7, roster: toRoster(connected) })
    )
    assert.deepEqual(
        afterJoin().map(([tag, to]) => [tag, to]),
        [
            ['mute_v2', `${ID}@call`],
            ['user_action', `${ID}@call`],
            ['mute_v2', `${ID}@call`],
            ['user_action', `${ID}@call`]
        ]
    )
    assert.deepEqual(sentWithTag(harness, 'video'), [], 'video is not replayed')
})

test('a mute request for a device not on the roster is refused, an account names its first', async () => {
    const harness = await activeGroupSession()

    await harness.session.requestParticipantMute(PEER)
    await harness.session.requestParticipantMute(PEER_SECOND_DEVICE)
    await assert.rejects(
        () => harness.session.requestParticipantMute('50062877036657:99@lid'),
        /not on call/
    )

    assert.deepEqual(
        sentWithTag(harness, 'mute_v2').map((node) => node.attrs.to),
        [PEER_DEVICE, PEER_SECOND_DEVICE]
    )
})
