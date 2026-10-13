import assert from 'node:assert/strict'
import { test } from 'node:test'

import { routeCallStanza } from '../../signaling/bridge.js'
import { type WaCallManager } from '../WaCallManager.js'

import {
    activeGroupCall,
    callNode,
    createManager,
    createMock,
    CREATOR_DEVICE,
    innerOf,
    joinableGroupOffer,
    type Mock,
    OTHER,
    sentInner
} from './_group-call-fixtures.js'

test('participant events carry the device they came from', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const mutes: unknown[][] = []
    const requests: unknown[][] = []
    const videoStates: unknown[][] = []
    manager.on('call_peer_mute', (_call, muted, participantJid) =>
        mutes.push([muted, participantJid])
    )
    manager.on('call_mute_requested', (_call, participantJid, requestState) =>
        requests.push([participantJid, requestState])
    )
    manager.on('call_peer_video_state', (_call, change, participantJid) =>
        videoStates.push([change.state, participantJid])
    )
    const call = await activeGroupCall(mock, manager, 'PE')
    const sender = '3333333333:9@lid'
    const callStanza = (tag: string, attrs: Record<string, string>) =>
        callNode(tag, sender, { 'call-id': 'PE', 'call-creator': CREATOR_DEVICE, ...attrs })

    await routeCallStanza(manager, mock.deps, callStanza('mute_v2', { 'mute-state': '1' }))
    await routeCallStanza(manager, mock.deps, callStanza('mute_v2', { 'request-state': '1' }))
    await routeCallStanza(
        manager,
        mock.deps,
        callStanza('video', { state: '6', device_orientation: '0', 'transaction-id': '2' })
    )

    assert.deepEqual(mutes, [[true, sender]])
    assert.deepEqual(requests, [[sender, '1']])
    assert.equal(call.stateData.audioMuted, false, 'a request is never applied')
    assert.deepEqual(videoStates, [[6, sender]])
})

test('a mute request goes to the device of the participant asked', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await activeGroupCall(mock, manager, 'MQ')

    await manager.requestParticipantMute('MQ', OTHER)

    const [request] = sentInner(mock, 'mute_v2').filter(
        (node) => innerOf(node).attrs['request-state'] !== undefined
    )
    assert.equal(request.attrs.to, '3333333333@lid')
    assert.deepEqual(innerOf(request).attrs, {
        'call-id': 'MQ',
        'call-creator': CREATOR_DEVICE,
        'request-state': '1'
    })
    await assert.rejects(() => manager.requestParticipantMute('unknown', OTHER), /No call/)
})

test('per-participant audio reaches the session only when asked for', async () => {
    const delegateOf = (manager: WaCallManager, callId: string) =>
        (
            manager as unknown as {
                calls: Map<string, { delegate: { emitParticipantAudio?: unknown } }>
            }
        ).calls.get(callId)?.delegate

    const off = createManager(createMock())
    await off.handleCallOffer(joinableGroupOffer('PA'), CREATOR_DEVICE)
    assert.equal(delegateOf(off, 'PA')?.emitParticipantAudio, undefined)

    const on = createManager(createMock(), { participantAudio: true })
    await on.handleCallOffer(joinableGroupOffer('PA'), CREATOR_DEVICE)
    assert.equal(typeof delegateOf(on, 'PA')?.emitParticipantAudio, 'function')
})

/** The `screen_share_id` of every screen share this side sent, in order. */
function sentScreenShareIds(mock: Mock): [string, string][] {
    return sentInner(mock, 'screen_share').map((node) => [
        innerOf(node).attrs.screenshare_state,
        innerOf(node).attrs.screen_share_id
    ])
}

test('every share start and stop of a 1:1 call takes the next screen_share_id', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(
        callNode('offer', CREATOR_DEVICE, { 'call-id': 'S1', 'call-creator': CREATOR_DEVICE }, [
            { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
            { tag: 'video', attrs: { enc: 'h.264', dec: 'H264' } }
        ]),
        CREATOR_DEVICE
    )
    await manager.acceptCall('S1')
    manager.getCall('S1')?.applyTransition({ type: 'media_connected' })

    for (const sharing of [true, false, true, false]) {
        await manager.setScreenShare('S1', sharing)
    }

    assert.deepEqual(sentScreenShareIds(mock), [
        ['1', '1'],
        ['2', '2'],
        ['1', '3'],
        ['2', '4']
    ])
    assert.ok(sentInner(mock, 'screen_share').every((node) => node.attrs.to === CREATOR_DEVICE))
})

test('every share start and stop of a group call takes the next screen_share_id', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await activeGroupCall(mock, manager, 'S2')
    await manager.setVideoEnabled('S2', true)

    await manager.setScreenShare('S2', true)
    await manager.setScreenShare('S2', false)
    await manager.setScreenShare('S2', true)

    assert.deepEqual(sentScreenShareIds(mock), [
        ['1', '1'],
        ['2', '2'],
        ['1', '3']
    ])
    assert.ok(sentInner(mock, 'screen_share').every((node) => node.attrs.to === 'S2@call'))
})
