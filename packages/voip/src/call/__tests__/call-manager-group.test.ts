import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { routeCallStanza } from '../../signaling/bridge.js'
import { type CallOfferOptions, CallState, EndCallReason } from '../../types.js'
import { type CallInfo, WA_GROUP_CALL_ENDED_REASON } from '../call-state.js'
import type { WaGroupCompositionDiff } from '../group-participants.js'

import {
    activeGroupCall,
    callNode,
    createManager,
    createMock,
    CREATOR,
    CREATOR_DEVICE,
    GROUP_JID,
    innerOf,
    joinableGroupOffer,
    OTHER,
    OTHER_DEVICE,
    relayNode,
    rosterNode,
    SELF_DEVICE,
    sentInner,
    terminate
} from './_group-call-fixtures.js'

const CALL_KEY = new Uint8Array(32).fill(0x42)

function encRekey(callId: string, transactionId = '13'): BinaryNode {
    return callNode(
        'enc_rekey',
        OTHER_DEVICE,
        { 'call-id': callId, 'call-creator': CREATOR_DEVICE, 'transaction-id': transactionId },
        [
            { tag: 'encopt', attrs: { keygen: '2' } },
            { tag: 'enc', attrs: { v: '2', type: 'msg', count: '0' }, content: Uint8Array.of(9) }
        ]
    )
}

test('an incoming group offer records the group, its joinable flag and its composition', async () => {
    const mock = createMock()
    const manager = createManager(mock)

    await manager.handleCallOffer(joinableGroupOffer('G1'), CREATOR_DEVICE)

    const call = manager.getCall('G1')
    assert.ok(call)
    assert.equal(call.groupJid, GROUP_JID)
    assert.equal(call.joinable, true)
    assert.deepEqual(
        call.groupComposition?.participants.map((participant) => participant.jid),
        ['1111111111@lid', CREATOR, OTHER]
    )
    assert.deepEqual(
        sentInner(mock, 'preaccept').map((node) => node.attrs.to),
        ['G1@call'],
        'a group callee preaccepts to the call itself'
    )
})

test('a 1:1 offer is neither joinable nor a group, and still preaccepts', async () => {
    const mock = createMock()
    const manager = createManager(mock)

    await manager.handleCallOffer(
        callNode('offer', CREATOR_DEVICE, { 'call-id': 'P1', 'call-creator': CREATOR_DEVICE }, [
            { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }
        ]),
        CREATOR_DEVICE
    )

    const call = manager.getCall('P1')
    assert.equal(call?.joinable, false)
    assert.equal(call?.groupJid, undefined)
    assert.equal(call?.groupComposition, undefined)
    assert.equal(sentInner(mock, 'preaccept').length, 1)
})

test('accepting a group call answers the call itself, with no key in hand', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('G2'), CREATOR_DEVICE)

    await manager.acceptCall('G2')

    const [accept] = sentInner(mock, 'accept')
    assert.equal(accept.attrs.to, 'G2@call')
    assert.equal(manager.getCall('G2')?.stateData.state, CallState.Connecting)
})

test('an enc_rekey keys a group call and is answered with a receipt', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('G3'), CREATOR_DEVICE)
    mock.setDecrypted(CALL_KEY)

    await routeCallStanza(manager, mock.deps, encRekey('G3'))

    const receipt = mock.sent.find((node) => node.tag === 'receipt')
    assert.ok(receipt)
    assert.equal(receipt.attrs.to, OTHER, 'device 0 addressed bare, as it arrived')
    assert.equal(receipt.attrs.id, 'ENC_REKEYMSGID')
    assert.equal(innerOf(receipt).tag, 'enc_rekey')

    assert.deepEqual(manager.getCall('G3')?.encryptionKey, CALL_KEY)
    const plan = manager.getMediaSnapshot('G3')?.plan
    assert.ok(plan?.keys)
    assert.deepEqual(
        plan.group?.senders.map((sender) => sender.recv),
        [derivePerJidSrtpKey(CALL_KEY, CREATOR_DEVICE), derivePerJidSrtpKey(CALL_KEY, OTHER_DEVICE)]
    )
})

test('an enc_rekey ahead of its offer keys the call once the offer lands', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    mock.setDecrypted(CALL_KEY)

    await manager.handleCallEncRekey(encRekey('G4'), OTHER_DEVICE)
    assert.equal(manager.getCall('G4'), null)
    mock.setDecrypted(null)

    await manager.handleCallOffer(joinableGroupOffer('G4'), CREATOR_DEVICE)

    assert.deepEqual(manager.getCall('G4')?.encryptionKey, CALL_KEY)
    assert.equal(manager.getMediaSnapshot('G4')?.plan.group?.senders.length, 2)
})

test('early keys are held for eight calls at most, the oldest dropped first', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    mock.setDecrypted(CALL_KEY)

    for (let i = 0; i < 9; i++) {
        await manager.handleCallEncRekey(encRekey(`E${i}`), OTHER_DEVICE)
    }
    mock.setDecrypted(null)

    await manager.handleCallOffer(joinableGroupOffer('E0'), CREATOR_DEVICE)
    await manager.handleCallOffer(joinableGroupOffer('E8'), CREATOR_DEVICE)
    assert.equal(manager.getCall('E0')?.encryptionKey, undefined)
    assert.deepEqual(manager.getCall('E8')?.encryptionKey, CALL_KEY)
})

test('an enc_rekey this device cannot read is still answered and keys nothing', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('G5'), CREATOR_DEVICE)

    await manager.handleCallEncRekey(encRekey('G5'), OTHER_DEVICE)

    assert.equal(mock.sent.filter((node) => node.tag === 'receipt').length, 1)
    assert.equal(manager.getCall('G5')?.encryptionKey, undefined)
})

test('a group_update routed off the wire reconciles the composition and reports it', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const diffs: WaGroupCompositionDiff[] = []
    manager.on('call_participants_changed', (_call, diff) => diffs.push(diff))
    await manager.handleCallOffer(joinableGroupOffer('G6'), CREATOR_DEVICE)

    await routeCallStanza(
        manager,
        mock.deps,
        callNode('group_update', 'G6@call', { 'call-id': 'G6', 'call-creator': CREATOR_DEVICE }, [
            rosterNode('9', { '1111111111@lid': 'connected', [CREATOR]: 'connected' })
        ])
    )

    assert.equal(diffs.length, 1)
    assert.equal(diffs[0].removed[0]?.jid, OTHER)
    assert.deepEqual(
        manager.getCall('G6')?.groupComposition?.participants.map((participant) => participant.jid),
        ['1111111111@lid', CREATOR]
    )
})

test('on an established group call only group_call_ended ends it; any other terminate drops one participant', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const ended: CallInfo[] = []
    const diffs: WaGroupCompositionDiff[] = []
    manager.on('call_ended', (call) => ended.push(call))
    manager.on('call_participants_changed', (_call, diff) => diffs.push(diff))
    const call = await activeGroupCall(mock, manager, 'G7')

    await manager.handleCallTerminate(terminate('G7', OTHER_DEVICE), OTHER_DEVICE)
    assert.equal(call.isEnded, false)
    assert.deepEqual(
        diffs[0]?.removed.map((removal) => removal.jid),
        [OTHER]
    )

    await manager.handleCallTerminate(
        terminate('G7', CREATOR_DEVICE, { reason: 'user_invisible' }),
        CREATOR_DEVICE
    )
    assert.equal(call.isEnded, false)

    await manager.handleCallTerminate(
        terminate('G7', CREATOR_DEVICE, { reason: WA_GROUP_CALL_ENDED_REASON }),
        CREATOR_DEVICE
    )
    assert.equal(call.isEnded, true)
    assert.deepEqual(ended, [call])
    assert.equal(manager.getCall('G7'), null)
})

test('a joinable call with our accept in flight keeps it even against a handover', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const states: string[] = []
    manager.on('call_state', (call) => states.push(call.stateData.state))
    await manager.handleCallOffer(joinableGroupOffer('G8'), CREATOR_DEVICE)
    await manager.acceptCall('G8')
    states.length = 0

    await manager.handleCallTerminate(
        terminate('G8', '1111111111:9@lid', { reason: 'accepted_elsewhere' }),
        '1111111111:9@lid'
    )

    assert.equal(manager.getCall('G8')?.isEnded, false)
    assert.deepEqual(states, [CallState.Connecting], 'the consumer sees the terminate did not take')
})

test('a handover on a ringing joinable call still ends it', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('G9'), CREATOR_DEVICE)

    await manager.handleCallTerminate(
        terminate('G9', '1111111111:9@lid', { reason: 'accepted_elsewhere' }),
        '1111111111:9@lid'
    )

    assert.equal(manager.getCall('G9'), null)
})

test('a bare terminate on the ring of a group call is dropped without an event', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('GA'), CREATOR_DEVICE)
    const events: string[] = []
    for (const event of ['call_state', 'call_ended'] as const) {
        manager.on(event, () => events.push(event))
    }

    await manager.handleCallTerminate(terminate('GA', OTHER_DEVICE), OTHER_DEVICE)

    assert.equal(manager.getCall('GA')?.isRinging, true)
    assert.deepEqual(events, [])
})

test('a joinable terminate ahead of its offer is ignored; a plain one still drops the offer', async () => {
    const mock = createMock()
    const manager = createManager(mock)

    await manager.handleCallTerminate(
        terminate('GB', OTHER_DEVICE, { joinable: '1' }),
        OTHER_DEVICE
    )
    await manager.handleCallOffer(joinableGroupOffer('GB'), CREATOR_DEVICE)
    assert.ok(manager.getCall('GB'), 'one participant leaving a pending group call says nothing')

    await manager.handleCallTerminate(terminate('GC', OTHER_DEVICE), OTHER_DEVICE)
    await manager.handleCallOffer(joinableGroupOffer('GC'), CREATOR_DEVICE)
    assert.equal(manager.getCall('GC'), null)
})

test('startCall with a group jid places one offer to the call and seeds who it rings', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const announced: CallInfo[] = []
    manager.on('call_state', (call) => announced.push(call))

    const callId = await manager.startCall({
        groupJid: GROUP_JID,
        participants: [{ jid: CREATOR }, { jid: OTHER, devices: [OTHER_DEVICE] }]
    })

    const offers = sentInner(mock, 'offer')
    assert.equal(offers.length, 1)
    assert.equal(offers[0].attrs.to, `${callId}@call`)
    assert.equal(innerOf(offers[0]).attrs['group-jid'], GROUP_JID)

    const call = manager.getCall(callId)
    assert.ok(call)
    assert.equal(call.groupJid, GROUP_JID)
    assert.equal(call.joinable, true)
    assert.equal(call.encryptionKey, undefined, 'a group offer carries no key')
    assert.deepEqual(
        call.groupComposition?.participants.map((participant) => participant.jid),
        ['1111111111@lid', CREATOR, OTHER]
    )
    assert.equal(call.stateData.state, CallState.Ringing)
    assert.deepEqual(announced, [call])
})

test('startCall needs a peer, or a group with participants', async () => {
    const manager = createManager(createMock())

    await assert.rejects(() => manager.startCall({} as CallOfferOptions), /peerJid/)
    await assert.rejects(
        () => manager.startCall({ groupJid: GROUP_JID, participants: [] }),
        /participants/
    )
    assert.deepEqual(manager.getCalls(), [])
})

test('a group offer that left while the manager was destroyed is ended for everybody', async () => {
    const mock = createMock()
    let release!: () => void
    let offered!: () => void
    const offeredPromise = new Promise<void>((resolve) => (offered = resolve))
    const gate = new Promise<void>((resolve) => (release = resolve))
    const lowLevel = mock.deps.lowLevelCoordinator as unknown as {
        sendNode: (node: BinaryNode) => Promise<void>
    }
    lowLevel.sendNode = async (node) => {
        mock.sent.push(node)
        if (innerOf(node).tag === 'offer') {
            offered()
            await gate
        }
    }
    const manager = createManager(mock)

    const placing = manager.startCall({
        groupJid: GROUP_JID,
        participants: [{ jid: CREATOR }, { jid: OTHER }]
    })
    await offeredPromise
    manager.destroy()
    release()

    await assert.rejects(placing, /destroyed/)
    const [offer] = sentInner(mock, 'offer')
    assert.deepEqual(
        sentInner(mock, 'terminate').map((node) => [node.attrs.to, innerOf(node).attrs.reason]),
        [[offer.attrs.to, undefined]],
        'withdrawn like a leave: a client never sends group_call_ended'
    )
})

test('leaving a group call drops our leg and leaves the call to the others', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await activeGroupCall(mock, manager, 'GD')

    await manager.leaveCall('GD')

    assert.equal(manager.getCall('GD'), null)
    const terminates = sentInner(mock, 'terminate')
    assert.deepEqual(
        terminates.map((node) => node.attrs.to),
        ['GD@call']
    )
    assert.equal(innerOf(terminates[0]).attrs.reason, undefined)
})

test('leaving a 1:1 call is refused, and leaves it running', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const callId = await manager.startCall({ peerJid: CREATOR })

    await assert.rejects(() => manager.leaveCall(callId), /not a group call/)
    assert.equal(manager.getCall(callId)?.isEnded, false)
    await manager.leaveCall('unknown')
})

test('a group call that loses its media path leaves instead of ending the call', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const call = await activeGroupCall(mock, manager, 'GE')

    manager.handleMediaEvent('GE', { type: 'relay_lost', reason: 'legs_closed' })
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(call.isEnded, true)
    assert.equal(call.stateData.endReason, EndCallReason.RelayLost)
    const terminates = sentInner(mock, 'terminate')
    assert.deepEqual(
        terminates.map((node) => [node.attrs.to, innerOf(node).attrs.reason]),
        [['GE@call', undefined]]
    )
})

test('a group plan published to a media host that cannot carry it is reported once', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const errors: Error[] = []
    manager.on('call_error', (error) => errors.push(error))
    await manager.handleCallOffer(joinableGroupOffer('GF'), CREATOR_DEVICE)
    mock.setDecrypted(CALL_KEY)
    await manager.handleCallEncRekey(encRekey('GF'), OTHER_DEVICE)

    manager.handleMediaEvent('GF', { type: 'host', features: [] })
    manager.handleMediaEvent('GF', { type: 'host', features: [] })

    assert.equal(errors.length, 1)
})

test('the server terminates for a call we left are dropped quietly, and kill no later offer', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await activeGroupCall(mock, manager, 'GG')
    await manager.leaveCall('GG')
    const events: string[] = []
    for (const event of ['call_state', 'call_ended', 'call_incoming'] as const) {
        manager.on(event, () => events.push(event))
    }

    await manager.handleCallTerminate(
        terminate('GG', 'GG@call', { reason: 'user_invisible', joinable: '1' }),
        'GG@call'
    )
    await manager.handleCallTerminate(
        terminate('GG', 'GG@call', { reason: WA_GROUP_CALL_ENDED_REASON }),
        'GG@call'
    )
    assert.deepEqual(events, [])

    await manager.handleCallOffer(joinableGroupOffer('GG'), CREATOR_DEVICE)
    assert.ok(manager.getCall('GG'), 'a later offer for the same call is not held against')
})

test('a group offer the server refuses ends the call and frees it', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const ended: CallInfo[] = []
    manager.on('call_ended', (call) => ended.push(call))
    const callId = await manager.startCall({
        groupJid: GROUP_JID,
        participants: [{ jid: CREATOR }, { jid: OTHER }]
    })

    await manager.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': callId, error: '400' }
    })

    assert.equal(manager.getCall(callId), null)
    assert.equal(ended[0]?.stateData.endReason, EndCallReason.SetupFailed)
    const [terminateNode] = sentInner(mock, 'terminate')
    assert.equal(terminateNode.attrs.to, `${callId}@call`)
    assert.equal(innerOf(terminateNode).attrs.reason, 'setup_failed')
})

test('a group call we place connects on the roster, keyed by a joiner, and leaves with its duration', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const callId = await manager.startCall({
        groupJid: GROUP_JID,
        participants: [{ jid: CREATOR }, { jid: OTHER }]
    })
    const call = manager.getCall(callId)
    assert.ok(call)

    // The joiner's key reaches us while our call still rings.
    mock.setDecrypted(CALL_KEY)
    await routeCallStanza(manager, mock.deps, encRekey(callId))
    assert.equal(call.stateData.state, CallState.Ringing)
    assert.deepEqual(call.encryptionKey, CALL_KEY)
    assert.ok(manager.getMediaSnapshot(callId)?.plan.keys)

    await routeCallStanza(
        manager,
        mock.deps,
        callNode(
            'group_update',
            `${callId}@call`,
            { 'call-id': callId, 'call-creator': SELF_DEVICE },
            [
                rosterNode('13', {
                    '1111111111@lid': 'connected',
                    [CREATOR]: 'connected',
                    [OTHER]: 'outgoing'
                })
            ]
        )
    )
    assert.equal(call.stateData.state, CallState.Connecting)
    assert.equal(manager.getMediaSnapshot(callId)?.plan.accepted, true)

    manager.handleMediaEvent(callId, { type: 'active' })
    assert.equal(call.stateData.state, CallState.Active)

    await manager.endCall(callId)
    const [terminateNode] = sentInner(mock, 'terminate')
    assert.equal(terminateNode.attrs.to, `${callId}@call`)
    const attrs = innerOf(terminateNode).attrs
    assert.equal(attrs.reason, undefined, 'the creator only leaves; the server ends the call')
    assert.ok(attrs.duration !== undefined && attrs.duration === attrs.audio_duration)
})

const COMPANION_CREATOR = '2222222222:87@lid'

/**
 * A 1:1 call that turned into a group call by inviting this side: no `group-jid`, only
 * `joinable` and a roster of three, as the capture has it.
 */
function inviteIntoOneToOneOffer(callId: string): BinaryNode {
    return callNode(
        'offer',
        COMPANION_CREATOR,
        {
            'call-id': callId,
            'call-creator': COMPANION_CREATOR,
            caller_pn: '5511920387975@s.whatsapp.net',
            joinable: '1'
        },
        [
            {
                tag: 'group_info',
                attrs: {
                    'call-creator': COMPANION_CREATOR,
                    'call-id': callId,
                    'transaction-id': '10',
                    media: 'audio',
                    'connected-limit': '32'
                },
                content: [
                    {
                        tag: 'user',
                        attrs: { jid: '1111111111@lid', state: 'outgoing' },
                        content: [
                            { tag: 'device', attrs: { jid: SELF_DEVICE, platform: 'android' } }
                        ]
                    },
                    {
                        tag: 'user',
                        attrs: { jid: CREATOR, state: 'connected' },
                        content: [
                            { tag: 'device', attrs: { jid: COMPANION_CREATOR, platform: 'web' } }
                        ]
                    },
                    {
                        tag: 'user',
                        attrs: { jid: OTHER, state: 'connected' },
                        content: [
                            { tag: 'device', attrs: { jid: '3333333333:9@lid', platform: 'web' } }
                        ]
                    }
                ]
            },
            { tag: 'audio', attrs: { enc: 'opus', rate: '16000' } },
            { tag: 'net', attrs: { medium: '2' } }
        ]
    )
}

test('a 1:1 call turned group by an invite is a group call, preaccepted and accepted at the call', async () => {
    const mock = createMock()
    const manager = createManager(mock)

    await routeCallStanza(manager, mock.deps, inviteIntoOneToOneOffer('D1'))

    const call = manager.getCall('D1')
    assert.ok(call)
    assert.equal(call.groupJid, undefined, 'the offer names no group')
    assert.equal(call.isGroupCall, true)
    assert.equal(call.groupComposition?.participants.length, 3)
    assert.deepEqual(
        sentInner(mock, 'preaccept').map((node) => node.attrs.to),
        ['D1@call'],
        'never the 1:1 preaccept to the inviting device'
    )

    await manager.acceptCall('D1')
    const [accept] = sentInner(mock, 'accept')
    assert.equal(accept.attrs.to, 'D1@call')
})

test('an accept ack with no call-id finds its call by the call address it came from', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    await manager.handleCallOffer(joinableGroupOffer('K1'), CREATOR_DEVICE)
    await manager.handleCallOffer(joinableGroupOffer('K2'), CREATOR_DEVICE)
    await manager.acceptCall('K2')

    await manager.handleCallAck({
        tag: 'ack',
        attrs: { class: 'call', type: 'accept', from: 'K2@call' },
        content: [relayNode('2')]
    })

    assert.ok((manager.getMediaSnapshot('K2')?.plan.relays?.endpoints.length ?? 0) > 0)
    assert.equal(manager.getMediaSnapshot('K1')?.plan.relays ?? null, null)
})

test('the server acks of heartbeats and peer reports reach their call and change nothing', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    const call = await activeGroupCall(mock, manager, 'HB')
    const before = mock.sent.length

    for (const type of ['heartbeat', 'peer_state']) {
        await manager.handleCallAck({
            tag: 'ack',
            attrs: { class: 'call', type, from: 'HB@call', id: `${type}-1` }
        })
    }

    assert.equal(call.stateData.state, CallState.Active)
    assert.equal(mock.sent.length, before)
})

test('a call key ahead of a roster-only group offer keys the call once the offer lands', async () => {
    const mock = createMock()
    const manager = createManager(mock)
    mock.setDecrypted(CALL_KEY)

    await manager.handleCallEncRekey(encRekey('D2'), OTHER_DEVICE)
    mock.setDecrypted(null)
    await manager.handleCallOffer(inviteIntoOneToOneOffer('D2'), COMPANION_CREATOR)
    await new Promise((resolve) => setImmediate(resolve))

    const call = manager.getCall('D2')
    assert.equal(call?.groupJid, undefined)
    assert.equal(call?.isGroupCall, true)
    assert.deepEqual(call?.encryptionKey, CALL_KEY)
})
