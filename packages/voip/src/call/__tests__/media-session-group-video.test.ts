import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { CallMediaType } from '../../types.js'

import {
    activeGroupSession,
    CALL_KEY,
    callStanza,
    createSession,
    groupUpdate,
    ID,
    innerOf,
    lastGroup,
    PEER_DEVICE,
    SELF_DEVICE,
    sentWithTag,
    THIRD_DEVICE,
    THIRD_KEY,
    THREE_WAY,
    toRoster
} from './_group-session.js'

test('a video upgrade on a group call asks the call itself, and is granted by av_upgrade', async () => {
    const harness = await createSession()
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    const upgrading = harness.session.requestVideoUpgrade()
    await Promise.resolve()
    const [request] = sentWithTag(harness, 'video')
    assert.equal(request.attrs.to, `${ID}@call`)
    assert.deepEqual(innerOf(request).attrs, {
        'call-id': ID,
        'call-creator': PEER_DEVICE,
        state: '3',
        device_orientation: '0',
        dec: 'H264',
        'transaction-id': '1',
        voip_settings: 'video'
    })

    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(SELF_DEVICE))

    assert.equal(await upgrading, 'accepted')
    assert.equal(harness.call.mediaType, CallMediaType.Video)
    assert.deepEqual(harness.link.plan.video, { send: true, receive: true })
    assert.equal(sentWithTag(harness, 'video').length, 1, 'our camera is on: nothing more to say')
})

/** The server's answer to an upgrade request: `<av_upgrade>` and a roster turned to video. */
function avUpgradeUpdate(upgrader: string): BinaryNode {
    const update = groupUpdate({ transactionId: 18, roster: toRoster(THREE_WAY) })
    const inner = (update.content as BinaryNode[])[0]
    const content = (inner.content as BinaryNode[]).map((child) =>
        child.tag === 'group_info' ? { ...child, attrs: { ...child.attrs, media: 'video' } } : child
    )
    return {
        ...update,
        content: [
            {
                ...inner,
                content: [{ tag: 'av_upgrade', attrs: { 'av-upgrader': upgrader } }, ...content]
            }
        ]
    }
}

test('a group call another participant upgrades turns to video, our camera announced off', async () => {
    const harness = await createSession()
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(THIRD_DEVICE))

    assert.equal(harness.call.mediaType, CallMediaType.Video)
    assert.deepEqual(harness.link.plan.video, { send: false, receive: true })
    assert.deepEqual(harness.upgrades, ['112984198234339@lid'])
    const [stopped] = sentWithTag(harness, 'video')
    assert.equal(stopped.attrs.to, `${ID}@call`)
    assert.equal(innerOf(stopped).attrs.state, '6')

    // The same update again changes nothing.
    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(THIRD_DEVICE))
    assert.equal(sentWithTag(harness, 'video').length, 1)
})

test('our camera on a group call goes on and off through the call itself', async () => {
    const harness = await createSession({ mediaType: CallMediaType.Video })
    harness.call.applyTransition({ type: 'local_accepted' })
    harness.call.applyTransition({ type: 'media_connected' })

    await harness.session.setVideoEnabled(false)
    assert.equal(harness.link.plan.video?.send, false)
    assert.equal(harness.call.stateData.videoOff, true)

    await harness.session.setVideoEnabled(true)
    assert.equal(harness.link.plan.video?.send, true)
    assert.equal(harness.call.stateData.videoOff, false)

    assert.deepEqual(
        sentWithTag(harness, 'video').map((node) => [
            node.attrs.to,
            innerOf(node).attrs.state,
            innerOf(node).attrs['transaction-id']
        ]),
        [
            [`${ID}@call`, '6', '1'],
            [`${ID}@call`, '1', '2']
        ]
    )

    const plain = await createSession({ group: false })
    await assert.rejects(() => plain.session.setVideoEnabled(true), /not a group call/)
})

test("a participant's video state is its own, with no upgrade handshake on a group call", async () => {
    const harness = await activeGroupSession()

    harness.session.handleCallVideoState(
        callStanza(PEER_DEVICE, 'video', { state: '1', 'transaction-id': '3' }),
        PEER_DEVICE
    )
    harness.session.handleCallVideoState(
        callStanza(THIRD_KEY, 'video', { state: '6', 'transaction-id': '1' }),
        THIRD_KEY
    )
    // An upgrade request code from a participant opens no 1:1 handshake.
    harness.session.handleCallVideoState(
        callStanza(THIRD_KEY, 'video', { state: '11', 'transaction-id': '2' }),
        THIRD_KEY
    )
    await harness.session.acceptVideoUpgrade()

    assert.equal(harness.call.participantMedia.get(PEER_DEVICE)?.video?.state, 1)
    assert.equal(harness.call.participantMedia.get(THIRD_KEY)?.video?.state, 11)
    assert.equal(harness.call.peerVideoState, undefined)
    assert.deepEqual(
        harness.events.filter(([event]) => event === 'video'),
        [
            ['video', PEER_DEVICE, 1],
            ['video', THIRD_KEY, 6],
            ['video', THIRD_KEY, 11]
        ]
    )
    assert.equal(harness.link.plan.video?.receive, true)
    assert.deepEqual(sentWithTag(harness, 'video'), [], 'nothing was there to accept')
})

test('the video asked of the SFU follows the cameras that are on, changed at most every 2 s', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const senderOf = (device: string) =>
        [...harness.call.groupSenders].find(([, jid]) => jid === device)?.[0]

    harness.session.handleCallVideoState(
        callStanza(PEER_DEVICE, 'video', { state: '1', 'transaction-id': '1' }),
        PEER_DEVICE
    )
    await Promise.resolve()
    assert.deepEqual(lastGroup(harness.link)?.videoSubscriptions, [
        { senderId: senderOf(PEER_DEVICE), quality: 0 }
    ])

    harness.session.handleCallVideoState(
        callStanza(THIRD_KEY, 'video', { state: '1', 'transaction-id': '1' }),
        THIRD_KEY
    )
    await Promise.resolve()
    assert.equal(lastGroup(harness.link)?.videoSubscriptions?.length, 1, 'held back')

    harness.clock.now += 2_000
    t.mock.timers.tick(2_000)
    await Promise.resolve()
    assert.deepEqual(
        lastGroup(harness.link)?.videoSubscriptions?.map((subscription) => subscription.senderId),
        [senderOf(PEER_DEVICE), senderOf(THIRD_KEY)]
    )
})

test('the app can choose whose video to ask for, and nobody is asked for in a call of two', async () => {
    const harness = await activeGroupSession()
    await harness.session.applyCallKey(CALL_KEY, 1)
    const thirdSender = harness.call.participantMedia.get(THIRD_KEY)?.senderId

    harness.session.setVideoSubscriptions([{ participantJid: THIRD_KEY, quality: 4 }])
    await Promise.resolve()
    assert.deepEqual(lastGroup(harness.link)?.videoSubscriptions, [
        { senderId: thirdSender, quality: 4 }
    ])

    const pair = await activeGroupSession({ composition: THREE_WAY.slice(0, 2) })
    await pair.session.applyCallKey(CALL_KEY, 1)
    pair.session.handleCallVideoState(
        callStanza(PEER_DEVICE, 'video', { state: '1', 'transaction-id': '1' }),
        PEER_DEVICE
    )
    await Promise.resolve()
    assert.equal(lastGroup(pair.link)?.videoSubscriptions, undefined)
})

test('the av-upgradable marker every call carries is no upgrade; av-upgrader is', async () => {
    const harness = await activeGroupSession()
    const marker = groupUpdate({ transactionId: 17, roster: toRoster(THREE_WAY) })
    const inner = (marker.content as BinaryNode[])[0]
    const withMarker: BinaryNode = {
        ...marker,
        content: [
            {
                ...inner,
                content: [
                    { tag: 'av_upgrade', attrs: { 'av-upgradable': '1' } },
                    ...(inner.content as BinaryNode[])
                ]
            }
        ]
    }

    await harness.session.handleCallGroupUpdate(withMarker)
    assert.equal(harness.call.mediaType, CallMediaType.Audio)
    assert.deepEqual(harness.upgrades, [])
    assert.deepEqual(sentWithTag(harness, 'video'), [])

    await harness.session.handleCallGroupUpdate(avUpgradeUpdate(THIRD_DEVICE))
    assert.equal(harness.call.mediaType, CallMediaType.Video)
    assert.deepEqual(harness.upgrades, [THIRD_KEY])
    assert.equal(innerOf(sentWithTag(harness, 'video')[0]).attrs.state, '6')
})

test('no video leaves once our group camera is off', async () => {
    const harness = await activeGroupSession({ mediaType: CallMediaType.Video })
    let framesSent = 0
    harness.link.sendVideoFrame = () => {
        framesSent++
        return 3
    }

    assert.equal(harness.session.feedLiveVideo(Uint8Array.of(0, 0, 1), 0), 3)
    await harness.session.setVideoEnabled(false)
    assert.equal(harness.session.feedLiveVideo(Uint8Array.of(0, 0, 1), 1), 0)
    assert.equal(framesSent, 1)

    await harness.session.setVideoEnabled(true)
    assert.equal(harness.session.feedLiveVideo(Uint8Array.of(0, 0, 1), 2), 3)
})
