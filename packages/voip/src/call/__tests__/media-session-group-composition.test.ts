import assert from 'node:assert/strict'
import { test } from 'node:test'

import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { generateSecureSsrc, WA_SSRC_SLOT } from '../../crypto/ssrc.js'
import { CallMediaType, CallState } from '../../types.js'
import {
    buildGroupSection,
    groupSenderId,
    selfStreamLayers,
    senderStreamsOf
} from '../group-media-plan.js'
import { createGroupComposition, type WaCallGroupParticipant } from '../group-participants.js'

import {
    activeGroupSession,
    CALL_KEY,
    callStanza,
    CONNECTED,
    createSession,
    FOURTH,
    FOURTH_DEVICE,
    groupUpdate,
    ID,
    lastGroup,
    OTHER_CALL_KEY,
    PEER,
    PEER_DEVICE,
    PEER_SECOND_DEVICE,
    PLACED,
    placedGroupCall,
    SELF,
    SELF_DEVICE,
    senderStreams,
    THIRD,
    THIRD_DEVICE,
    THIRD_KEY,
    THREE_WAY,
    toRoster
} from './_group-session.js'

test('a group call declares its streams by layer and recognizes app data from every sender', async () => {
    const harness = await createSession()

    const ssrcs = harness.link.plan.ssrcs
    assert.ok(ssrcs)
    assert.deepEqual(ssrcs.selfLayers, selfStreamLayers(ID, SELF_DEVICE))
    for (const device of [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE]) {
        const appData = generateSecureSsrc(ID, device, WA_SSRC_SLOT.APP_DATA.MAIN)
        assert.ok(ssrcs.peerAppData.includes(appData), device)
    }
    assert.deepEqual(
        ssrcs.peerStreams,
        senderStreams([PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE])
    )
    assert.equal(
        ssrcs.peerAppData.includes(generateSecureSsrc(ID, SELF_DEVICE, WA_SSRC_SLOT.APP_DATA.MAIN)),
        false
    )
    // No key yet, so nobody can be keyed.
    assert.equal(harness.link.sections('group').length, 0)
})

test('a 1:1 call declares no layers and publishes no group', async () => {
    const harness = await createSession({ group: false })
    await harness.session.applyCallKey(CALL_KEY, 1)

    assert.equal(harness.link.plan.ssrcs?.selfLayers, undefined)
    assert.equal(harness.link.sections('group').length, 0)
    assert.equal(harness.link.sections('keys').length, 0, 'a rekey on a 1:1 call is ignored')
    assert.equal(harness.call.encryptionKey, undefined)
})

test('a call key keys every sender with its own device key', async () => {
    const harness = await createSession()

    await harness.session.applyCallKey(CALL_KEY, 13)

    const keys = harness.link.plan.keys
    assert.ok(keys)
    assert.deepEqual(keys.send, derivePerJidSrtpKey(CALL_KEY, SELF_DEVICE))
    const group = lastGroup(harness.link)
    assert.ok(group)
    assert.deepEqual(
        group.senders.map((sender) => sender.recv),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) =>
            derivePerJidSrtpKey(CALL_KEY, jid)
        )
    )
    assert.deepEqual(
        group.senders.map((sender) => sender.audio),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) =>
            generateSecureSsrc(ID, jid, WA_SSRC_SLOT.AUDIO.MAIN)
        )
    )
    // Keys and senders travel in one update, so the media rebuilds and reinstalls together.
    const update = harness.link.updates.at(-1)
    assert.ok(update && 'keys' in update && 'group' in update)
})

test('the same key again changes nothing, a new one replaces every key', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const published = harness.link.updates.length
    const firstEpoch = harness.link.plan.keys?.epoch

    await harness.session.applyCallKey(Uint8Array.from(CALL_KEY), 2)
    assert.equal(harness.link.updates.length, published)

    await harness.session.applyCallKey(OTHER_CALL_KEY, 3)
    assert.notEqual(harness.link.plan.keys?.epoch, firstEpoch)
    assert.deepEqual(
        lastGroup(harness.link)?.senders[0].recv,
        derivePerJidSrtpKey(OTHER_CALL_KEY, PEER_DEVICE)
    )
})

test('a participant joining is keyed and announced, the same roster again changes nothing', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    const fourWay = [...THREE_WAY, { jid: FOURTH, devices: [FOURTH_DEVICE], state: CONNECTED }]
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 5, roster: toRoster(fourWay) })
    )

    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => sender.recv),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE, FOURTH_DEVICE].map((jid) =>
            derivePerJidSrtpKey(CALL_KEY, jid)
        )
    )
    assert.equal(harness.diffs.length, 1)
    assert.equal(harness.diffs[0].added[0]?.jid, FOURTH)
    assert.equal(harness.call.groupComposition?.lastTransactionId, 5)

    const groups = harness.link.sections('group').length
    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 6, roster: toRoster(fourWay) })
    )
    assert.equal(harness.link.sections('group').length, groups, 'nothing moved')
})

test('a participant left out of the roster stops being a sender', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 4, roster: toRoster(THREE_WAY.slice(0, 2)) })
    )

    assert.equal(
        lastGroup(harness.link)?.senders.some(
            (sender) => sender.audio === generateSecureSsrc(ID, THIRD_DEVICE)
        ),
        false
    )
    assert.equal(harness.diffs[0].removed[0]?.jid, THIRD)
})

test('a participant hanging up comes off the composition without moving its counter', async () => {
    const harness = await createSession()
    harness.call.groupComposition = createGroupComposition(THREE_WAY, 9)
    await harness.session.applyCallKey(CALL_KEY, 1)

    harness.session.removeGroupParticipant(THIRD_DEVICE, undefined)
    await Promise.resolve()

    assert.deepEqual(
        harness.call.groupComposition?.participants.map((participant) => participant.jid),
        [SELF, PEER]
    )
    assert.equal(harness.call.groupComposition?.lastTransactionId, 9)
    assert.equal(harness.diffs.length, 1)
    assert.equal(harness.diffs[0].removed[0]?.cause, 'departed')
    assert.equal(lastGroup(harness.link)?.senders.length, 2)

    harness.session.removeGroupParticipant('424242@lid', 'terminated')
    assert.equal(harness.diffs.length, 1, 'somebody not on the call leaves nothing to report')
})

test('a group call that starts receiving video keys every sender on video too', async () => {
    const harness = await createSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    harness.session.handleCallVideoState({
        tag: 'call',
        attrs: { from: PEER_DEVICE },
        content: [{ tag: 'video', attrs: { 'call-id': ID, state: '1', 'transaction-id': '1' } }]
    })
    await Promise.resolve()

    const group = lastGroup(harness.link)
    assert.deepEqual(
        group?.senders.map((sender) => sender.streams),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) => senderStreamsOf(ID, jid, true))
    )
})

test('the key a joiner sends while our call still rings keys it, and stays once it connects', async () => {
    const harness = await placedGroupCall()

    await harness.session.applyCallKey(CALL_KEY, 13)
    assert.equal(harness.call.stateData.state, CallState.Ringing)
    assert.deepEqual(harness.link.plan.keys?.send, derivePerJidSrtpKey(CALL_KEY, SELF_DEVICE))
    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => sender.recv),
        [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) =>
            derivePerJidSrtpKey(CALL_KEY, jid)
        )
    )

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 13,
            roster: toRoster([
                PLACED[0],
                { jid: PEER, devices: [PEER_SECOND_DEVICE], state: CONNECTED },
                PLACED[2]
            ])
        })
    )

    assert.equal(harness.call.stateData.state, CallState.Connecting)
    assert.deepEqual(harness.call.encryptionKey, CALL_KEY)
    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => sender.recv),
        [PEER_SECOND_DEVICE, THIRD_DEVICE].map((jid) => derivePerJidSrtpKey(CALL_KEY, jid))
    )
})

test('a participant leaving takes its raised hand and its media state with it', async () => {
    const harness = await activeGroupSession()
    harness.session.handleCallUserAction(
        callStanza(THIRD_KEY, 'user_action', { action: 'raise_hand' }, [
            { tag: 'raise_hand', attrs: { 'raise-hand-state': '1' } }
        ]),
        THIRD_KEY
    )
    harness.session.handleCallMuteV2(
        callStanza(THIRD_KEY, 'mute_v2', { 'mute-state': '1' }),
        THIRD_KEY
    )
    assert.equal(harness.call.raisedHands.has(THIRD_KEY), true)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({ transactionId: 4, roster: toRoster(THREE_WAY.slice(0, 2)) })
    )

    assert.equal(harness.call.raisedHands.size, 0)
    assert.equal(harness.call.participantMedia.has(THIRD_KEY), false)
    assert.deepEqual(harness.events.at(-1), ['hand', THIRD_KEY, false])
})

test('every sender maps back to its device, and every app-data stream is known, past 32', async () => {
    const crowd: WaCallGroupParticipant[] = [
        { jid: SELF, devices: [SELF_DEVICE], state: CONNECTED },
        ...Array.from({ length: 40 }, (_, i) => ({
            jid: `${9000 + i}@lid`,
            devices: [`${9000 + i}:0@lid`],
            state: CONNECTED
        }))
    ]
    const harness = await createSession({ composition: crowd })
    await harness.session.applyCallKey(CALL_KEY, 1)

    assert.equal(harness.call.groupSenders.size, 40)
    const senders = lastGroup(harness.link)?.senders ?? []
    assert.equal(harness.call.groupSenders.get(senders[0].id), '9000@lid')
    assert.equal(harness.link.plan.ssrcs?.peerAppData.length, 40)
    // The app data rides in each sender's streams, which is how a reaction finds its sender.
    for (const sender of senders) {
        const device = harness.call.groupSenders.get(sender.id) as string
        assert.ok(
            sender.streams.includes(
                generateSecureSsrc(ID, device.replace('@', ':0@'), WA_SSRC_SLOT.APP_DATA.MAIN)
            )
        )
    }
})

test('each sender carries the pid its roster gave it, 0 included', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)

    await harness.session.handleCallGroupUpdate(
        groupUpdate({
            transactionId: 5,
            roster: toRoster(THREE_WAY).map((entry) =>
                entry.jid === PEER
                    ? { ...entry, pids: { [PEER_DEVICE]: '0' } }
                    : entry.jid === THIRD
                      ? { ...entry, pids: { [THIRD_DEVICE]: '2' } }
                      : entry
            )
        })
    )

    assert.deepEqual(
        lastGroup(harness.link)?.senders.map((sender) => [
            harness.call.groupSenders.get(sender.id),
            sender.pid
        ]),
        [
            [PEER_DEVICE, 0],
            [PEER_SECOND_DEVICE, undefined],
            [THIRD_KEY, 2]
        ]
    )
})

test('every SSRC, sender id and key a sync publishes equals its direct derivation', async () => {
    const harness = await activeGroupSession({ mediaType: CallMediaType.Video })
    const devices = [PEER_DEVICE, PEER_SECOND_DEVICE, THIRD_DEVICE]
    const pids = new Map<string, number>()
    const expectPlan = (callKey: Uint8Array) => {
        assert.deepEqual(
            lastGroup(harness.link),
            buildGroupSection(ID, callKey, devices, true, pids)
        )
        const ssrcs = harness.link.plan.ssrcs
        assert.deepEqual(ssrcs?.selfLayers, selfStreamLayers(ID, SELF_DEVICE))
        assert.deepEqual(ssrcs?.peerStreams, senderStreams(devices, true))
        assert.deepEqual(
            ssrcs?.peerAppData,
            devices.map((jid) => generateSecureSsrc(ID, jid, WA_SSRC_SLOT.APP_DATA.MAIN))
        )
        assert.deepEqual(harness.link.plan.keys?.send, derivePerJidSrtpKey(callKey, SELF_DEVICE))
        for (const device of devices) {
            assert.equal(
                harness.call.participantMedia.get(device.replace(':0@', '@'))?.senderId,
                groupSenderId(ID, device)
            )
        }
    }

    await harness.session.applyCallKey(CALL_KEY, 1)
    expectPlan(CALL_KEY)
    await harness.session.applyCallKey(OTHER_CALL_KEY, 2)
    expectPlan(OTHER_CALL_KEY)
    await harness.session.applyCallKey(CALL_KEY, 3)
    expectPlan(CALL_KEY)
})

test('reactions and video are attributed to the sender device they came from', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const [first] = lastGroup(harness.link)?.senders ?? []

    harness.link.events.onReaction({ transactionId: 1n, reaction: 'R1' }, first.id)
    harness.link.events.onInboundVideoRtp({
        payloadType: 97,
        sequenceNumber: 1,
        timestamp: 1,
        ssrc: 7,
        marker: false,
        payload: new Uint8Array(),
        senderId: first.id
    })
    harness.link.events.onReaction({ transactionId: 2n, reaction: 'R2' }, 'unknown')

    assert.deepEqual(harness.events, [
        ['reaction', PEER_DEVICE, 'R1'],
        ['video_rtp', PEER_DEVICE, 7],
        ['reaction', undefined, 'R2']
    ])
})
