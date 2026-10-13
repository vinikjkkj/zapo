import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { BinaryNode } from 'zapo-js/transport'

import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { routeCallStanza } from '../../signaling/bridge.js'
import { encodeWAMessage } from '../../signaling/signaling.js'
import {
    CallMediaType,
    type CallOfferOptions,
    CallState,
    EndCallReason,
    type WaVoipDeps,
    type WaVoipStores
} from '../../types.js'
import { type CallInfo, WA_GROUP_CALL_ENDED_REASON } from '../call-state.js'
import type { WaGroupCompositionDiff } from '../group-participants.js'
import { WaCallManager } from '../WaCallManager.js'

const SELF_DEVICE = '1111111111:3@lid'
const CREATOR = '2222222222@lid'
const CREATOR_DEVICE = '2222222222:0@lid'
const OTHER = '3333333333@lid'
const OTHER_DEVICE = '3333333333:0@lid'
const GROUP_JID = '120363000000000000@g.us'
const CALL_KEY = new Uint8Array(32).fill(0x42)

interface Mock {
    readonly deps: WaVoipDeps
    readonly stores: WaVoipStores
    readonly sent: BinaryNode[]
    /** What `decryptMessage` hands back; `null` makes every decrypt fail. */
    setDecrypted(key: Uint8Array | null): void
}

function createMock(): Mock {
    const sent: BinaryNode[] = []
    let decrypted: Promise<Uint8Array> | null = null
    const deps = {
        isMobilePrimary: () => false,
        authClient: {
            getCurrentCredentials: () => ({ meJid: SELF_DEVICE, meLid: SELF_DEVICE })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            }
        },
        signalProtocol: {
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: Uint8Array.of(1, 2, 3) })),
            decryptMessage: async () => {
                if (!decrypted) throw new Error('no session')
                return decrypted
            }
        },
        signalDeviceSync: {
            syncDeviceList: async (jids: readonly string[]) =>
                jids.map((jid) => ({ jid, deviceJids: [jid.replace('@', ':0@')] })),
            queryLidsByPhoneJids: async () => []
        },
        messageDispatch: { syncSignalSession: async () => undefined },
        sessionResolver: {
            ensureSessionsBatch: async (devices: readonly string[]) =>
                devices.map((jid) => ({ address: jid, session: {} }))
        }
    } as unknown as WaVoipDeps
    const stores = { privacyToken: { getByJid: async () => undefined } } as unknown as WaVoipStores
    return {
        deps,
        stores,
        sent,
        setDecrypted: (key) => {
            decrypted = key ? encodeWAMessage({ call: { callKey: key } }) : null
        }
    }
}

function createManager(mock: Mock, options: { participantAudio?: boolean } = {}): WaCallManager {
    return new WaCallManager({
        deps: mock.deps,
        stores: mock.stores,
        maxConcurrentCalls: 2,
        mediaMode: 'remote',
        participantAudio: options.participantAudio
    })
}

function callNode(
    tag: string,
    from: string,
    attrs: Record<string, string>,
    content?: BinaryNode[]
) {
    return {
        tag: 'call',
        attrs: { from, id: `${tag.toUpperCase()}MSGID` },
        content: [{ tag, attrs, content }]
    } satisfies BinaryNode
}

function rosterNode(transactionId: string, states: Record<string, string>): BinaryNode {
    return {
        tag: 'group_info',
        attrs: { media: 'audio', 'connected-limit': '32', 'transaction-id': transactionId },
        content: [
            { jid: '1111111111@lid', device: SELF_DEVICE },
            { jid: CREATOR, device: CREATOR_DEVICE },
            { jid: OTHER, device: OTHER_DEVICE }
        ]
            .filter((user) => states[user.jid] !== undefined)
            .map((user) => ({
                tag: 'user',
                attrs: { jid: user.jid, state: states[user.jid] },
                content: [{ tag: 'device', attrs: { jid: user.device } }]
            }))
    }
}

const EVERYONE = { '1111111111@lid': 'invited', [CREATOR]: 'connected', [OTHER]: 'connected' }

function groupOffer(callId: string, attrs: Record<string, string> = {}): BinaryNode {
    return callNode(
        'offer',
        CREATOR_DEVICE,
        { 'call-id': callId, 'call-creator': CREATOR_DEVICE, ...attrs },
        [{ tag: 'audio', attrs: { enc: 'opus', rate: '16000' } }, rosterNode('8', EVERYONE)]
    )
}

function joinableGroupOffer(callId: string): BinaryNode {
    return groupOffer(callId, { 'group-jid': GROUP_JID, joinable: '1' })
}

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

function terminate(callId: string, from: string, attrs: Record<string, string> = {}): BinaryNode {
    return callNode('terminate', from, {
        'call-id': callId,
        'call-creator': CREATOR_DEVICE,
        ...attrs
    })
}

function sentInner(mock: Mock, tag: string): BinaryNode[] {
    return mock.sent.filter(
        (node) => Array.isArray(node.content) && (node.content as BinaryNode[])[0]?.tag === tag
    )
}

function innerOf(node: BinaryNode): BinaryNode {
    return (node.content as BinaryNode[])[0]
}

/** An incoming group call, accepted and active. */
async function activeGroupCall(mock: Mock, manager: WaCallManager, callId: string) {
    await manager.handleCallOffer(joinableGroupOffer(callId), CREATOR_DEVICE)
    await manager.acceptCall(callId)
    const call = manager.getCall(callId)
    assert.ok(call)
    call.applyTransition({ type: 'media_connected' })
    return call
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

/** A minimal reissued `<relay>`: one relay, its token and key. */
function relayNode(selfPid: string): BinaryNode {
    return {
        tag: 'relay',
        attrs: { self_pid: selfPid, 'transaction-id': '3' },
        content: [
            { tag: 'key', attrs: {}, content: 'RELAYKEY' },
            { tag: 'token', attrs: { id: '0' }, content: Uint8Array.of(0xd1) },
            {
                tag: 'te2',
                attrs: { relay_name: 'gru1c02', relay_id: '0', token_id: '0' },
                content: Uint8Array.of(10, 0, 0, 1, 0x0d, 0x96)
            }
        ]
    }
}

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
