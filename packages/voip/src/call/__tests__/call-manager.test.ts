import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import type { WaCallMediaPlan } from '@zapo-js/voip-media'

import { derivePerJidSrtpKey } from '../../crypto/encryption.js'
import { generateSecureSsrc, WA_SSRC_SLOT, WA_VIDEO_CALL_SSRC_SLOTS } from '../../crypto/ssrc.js'
import { routeCallStanza } from '../../signaling/bridge.js'
import { CallState, EndCallReason, type WaVoipDeps, type WaVoipStores } from '../../types.js'
import { type CallInfo } from '../call-state.js'
import { WaCallManager } from '../WaCallManager.js'
import { WaCallMediaSession } from '../WaCallMediaSession.js'

function createMockDeps(
    credentials: { meJid: string; meLid: string } = {
        meJid: '1111111111@lid',
        meLid: '1111111111@lid'
    }
): { deps: WaVoipDeps; stores: WaVoipStores; sent: BinaryNode[] } {
    const sent: BinaryNode[] = []
    const deps = {
        isMobilePrimary: () => false,
        authClient: {
            getCurrentCredentials: () => ({ ...credentials, signedIdentity: undefined })
        },
        lowLevelCoordinator: {
            sendNode: async (node: BinaryNode) => {
                sent.push(node)
            },
            query: async () => undefined
        },
        signalProtocol: {
            encryptMessage: async () => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) }),
            encryptMessagesBatch: async (requests: readonly unknown[]) =>
                requests.map(() => ({ type: 'msg', ciphertext: new Uint8Array([1, 2, 3]) })),
            decryptMessage: async () => new Uint8Array([1, 2, 3])
        },
        signalDeviceSync: {
            syncDeviceList: async () => [{ deviceJids: ['2222222222:0@lid'] }],
            queryLidsByPhoneJids: async () => []
        },
        messageDispatch: {
            syncSignalSession: async () => undefined
        },
        sessionResolver: {
            ensureSessionsBatch: async () => []
        }
    } as unknown as WaVoipDeps
    const stores = {
        privacyToken: { getByJid: async () => undefined }
    } as unknown as WaVoipStores

    return { deps, stores, sent }
}

function buildOfferNode(
    callId: string,
    from = '2222222222:0@lid',
    callerPn?: string,
    extra: readonly BinaryNode[] = []
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'OFFERMSGID' },
        content: [
            {
                tag: 'offer',
                attrs: {
                    'call-id': callId,
                    'call-creator': from,
                    ...(callerPn ? { caller_pn: callerPn } : {})
                },
                content: [
                    { tag: 'audio', attrs: { enc: 'opus', rate: '16000' }, content: undefined },
                    ...extra
                ]
            }
        ]
    }
}

const VIDEO_OFFER_NODE: BinaryNode = { tag: 'video', attrs: { enc: 'h.264', dec: 'H264' } }

/** An `<enc>` carrying the call key, which sends the offer through signal decryption. */
const CALL_KEY_ENC_NODE: BinaryNode = {
    tag: 'enc',
    attrs: { v: '2', type: 'msg' },
    content: new Uint8Array([1, 2, 3])
}

function buildMuteV2Node(
    callId: string,
    attrs: Record<string, string>,
    from = '2222222222:0@lid'
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'MUTEMSGID' },
        content: [
            {
                tag: 'mute_v2',
                attrs: { 'call-id': callId, 'call-creator': from, ...attrs }
            }
        ]
    }
}

function buildAcceptNode(
    callId: string,
    from = '2222222222:0@lid',
    callCreator = from,
    content?: BinaryNode[]
): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: 'ACCEPTMSGID' },
        content: [
            {
                tag: 'accept',
                attrs: { 'call-id': callId, 'call-creator': callCreator },
                content
            }
        ]
    }
}

interface AckRelay {
    readonly name: string
    readonly ip: readonly [number, number, number, number]
    readonly protocol?: string
    readonly c2rRtt?: number
    /** IPv6 address and port appended after the IPv4 block: one relay on both families. */
    readonly ipv6?: readonly number[]
}

/**
 * The server's ack to our offer: the relay block, every device of the call as a
 * `<participant>`, and one `<te2>` per relay, all sharing one token and key.
 */
function buildOfferAckNode(
    callId: string,
    participantJids: readonly string[],
    relays: readonly AckRelay[] = [{ name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 }]
): BinaryNode {
    return {
        tag: 'ack',
        attrs: { class: 'call', type: 'offer', 'call-id': callId, id: 'OFFERMSGID' },
        content: [
            {
                tag: 'relay',
                attrs: { uuid: 'UUID', self_pid: '1', peer_pid: '2' },
                content: [
                    ...participantJids.map((jid) => ({ tag: 'participant', attrs: { jid } })),
                    { tag: 'token', attrs: { id: '0' }, content: new Uint8Array([7, 7, 7]) },
                    { tag: 'key', attrs: {}, content: 'RELAYKEY' },
                    ...relays.map((relay) => ({
                        tag: 'te2',
                        attrs: {
                            relay_name: relay.name,
                            token_id: '0',
                            ...(relay.protocol ? { protocol: relay.protocol } : {}),
                            ...(relay.c2rRtt !== undefined ? { c2r_rtt: String(relay.c2rRtt) } : {})
                        },
                        content: new Uint8Array([...relay.ip, 0x0d, 0x96, ...(relay.ipv6 ?? [])])
                    }))
                ]
            }
        ]
    }
}

/** The `<relay>` an `<accept>` to our offer carries, naming the device that won. */
function acceptRelayNode(jid: string, pid: string): BinaryNode {
    return { tag: 'relay', attrs: {}, content: [{ tag: 'participant', attrs: { pid, jid } }] }
}

/** The plan a remote media host holds for the call right now. */
function planOf(manager: WaCallManager, callId: string): Partial<WaCallMediaPlan> {
    const snapshot = manager.getMediaSnapshot(callId)
    assert.ok(snapshot, 'the call publishes a media plan')
    return snapshot.plan
}

/** Every stream a call of this media type registers for the device, by slot. */
function streamsOf(callId: string, deviceJid: string, slots: readonly number[]): number[] {
    return slots.map((slot) => generateSecureSsrc(callId, deviceJid, slot))
}

/** The lifecycle events the app sees, in order, tagged with their call id. */
function recordCallEvents(manager: WaCallManager): string[] {
    const events: string[] = []
    for (const event of ['call_incoming', 'call_state', 'call_ended'] as const) {
        manager.on(event, (call: CallInfo) => events.push(`${event} ${call.callId}`))
    }
    return events
}

/** Holds the decryption of the offer's call key until released. */
function holdCallKeyDecrypt(deps: WaVoipDeps): () => void {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const signal = deps.signalProtocol as unknown as { decryptMessage: () => Promise<Uint8Array> }
    signal.decryptMessage = async () => {
        await gate
        return new Uint8Array([1, 2, 3])
    }
    return release
}

/**
 * Drives an outgoing call to the active state without any media, so a control
 * that is only allowed while the call is up can be exercised on its own.
 */
function forceActive(call: CallInfo): void {
    call.applyTransition({ type: 'remote_accepted' })
    call.applyTransition({ type: 'media_connected' })
}

function findByInnerTag(nodes: readonly BinaryNode[], tag: string): BinaryNode[] {
    return nodes.filter((node) => {
        const inner = Array.isArray(node.content) ? node.content[0] : null
        return !!inner && typeof inner === 'object' && 'tag' in inner && inner.tag === tag
    })
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

function callIdOf(node: BinaryNode): string | undefined {
    const inner = Array.isArray(node.content) ? node.content[0] : null
    return inner && typeof inner === 'object' && 'attrs' in inner
        ? inner.attrs['call-id']
        : undefined
}

function tagsSentFor(sent: readonly BinaryNode[], callId: string): string[] {
    return sent
        .filter((node) => callIdOf(node) === callId)
        .map((node) => (node.content as BinaryNode[])[0].tag)
}

/** Holds peer device resolution, the first await of incoming call setup, until released. */
function holdDeviceSync(deps: WaVoipDeps): () => void {
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const sync = deps.signalDeviceSync as unknown as { syncDeviceList: () => Promise<unknown> }
    sync.syncDeviceList = async () => {
        await gate
        return [{ deviceJids: ['2222222222:0@lid'] }]
    }
    return release
}

const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

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

test('setMute announces the new state to the peer, once per change', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)
    forceActive(call)

    const before = sent.length
    manager.setMute(callId, true)
    manager.setMute(callId, true)
    manager.setMute(callId, false)
    await Promise.resolve()

    const announcements = findByInnerTag(sent.slice(before), 'mute_v2')
    assert.equal(announcements.length, 2)

    assert.equal(announcements[0].attrs.to, '2222222222@lid')
    const first = (announcements[0].content as BinaryNode[])[0]
    assert.equal(first.attrs['call-id'], callId)
    assert.equal(first.attrs['call-creator'], '1111111111@lid')
    assert.equal(first.attrs['mute-state'], '1')

    const second = (announcements[1].content as BinaryNode[])[0]
    assert.equal(second.attrs['mute-state'], '0')

    assert.equal(call.stateData.audioMuted, false)
})

test('setMute on a call that is not active changes nothing and sends nothing', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const before = sent.length

    manager.setMute(callId, true)
    manager.setMute('NOSUCHCALL', true)

    assert.equal(findByInnerTag(sent.slice(before), 'mute_v2').length, 0)
    assert.equal(manager.getCall(callId)!.stateData.audioMuted, false)
})

test('the call announces its mute state once the media is connected', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const session = (
        manager as unknown as { calls: Map<string, { announceInitialMuteState: () => void }> }
    ).calls.get(callId)
    assert.ok(session)

    const before = sent.length
    // The reference client sends a message of its own a fraction of a second after
    // the call goes active, carrying `mute-state="0"` with nobody having touched the
    // microphone. Both ends send one, whichever placed the call.
    session.announceInitialMuteState()
    await Promise.resolve()

    const announced = findByInnerTag(sent.slice(before), 'mute_v2')
    assert.equal(announced.length, 1)
    const inner = announced[0]?.content?.[0] as BinaryNode
    assert.equal(inner.attrs['mute-state'], '0')
    assert.equal(inner.attrs['call-id'], callId)

    // Sent once: a second transition to active must not restate it.
    session.announceInitialMuteState()
    await Promise.resolve()
    assert.equal(findByInnerTag(sent.slice(before), 'mute_v2').length, 1)
})

test('neither side of an accept announces a mute state', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 2 })

    const incomingCallId = 'CA11CA11000000000000000000000002'
    await manager.handleCallOffer(buildOfferNode(incomingCallId), '2222222222:0@lid')
    const beforeAccept = sent.length
    await manager.acceptCall(incomingCallId)
    assert.equal(findByInnerTag(sent.slice(beforeAccept), 'mute_v2').length, 0)

    const outgoingCallId = await manager.startCall({ peerJid: '3333333333@lid' })
    const beforeRemoteAccept = sent.length
    await manager.handleCallAccept(
        buildAcceptNode(outgoingCallId, '3333333333:0@lid'),
        '3333333333:0@lid'
    )
    assert.equal(findByInnerTag(sent.slice(beforeRemoteAccept), 'mute_v2').length, 0)
})

test('an inbound mute_v2 records the peer state and emits it without replying', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    const call = manager.getCall(callId)
    assert.ok(call)
    assert.equal(call.stateData.peerAudioMuted, undefined)

    const observed: boolean[] = []
    manager.on('call_peer_mute', (_call, muted) => {
        observed.push(muted)
    })

    const before = sent.length
    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'mute-state': '1' }), '2222222222:0@lid')
    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'mute-state': '1' }), '2222222222:0@lid')
    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'mute-state': '0' }), '2222222222:0@lid')

    assert.deepEqual(observed, [true, false])
    assert.equal(call.stateData.peerAudioMuted, false)
    assert.equal(sent.length, before)
})

test('an inbound mute request is ignored on a 1:1 call', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    let fired = 0
    manager.on('call_peer_mute', () => {
        fired++
    })

    manager.handleCallMuteV2(buildMuteV2Node(callId, { 'request-state': '1' }), '2222222222:0@lid')

    assert.equal(fired, 0)
    assert.equal(manager.getCall(callId)!.stateData.peerAudioMuted, undefined)
})

test('an inbound mute_v2 from another device of this account is ignored', async () => {
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    let fired = 0
    manager.on('call_peer_mute', () => {
        fired++
    })

    manager.handleCallMuteV2(
        buildMuteV2Node(callId, { 'mute-state': '1' }, '1111111111:9@lid'),
        '1111111111:9@lid'
    )

    assert.equal(fired, 0)
    assert.equal(manager.getCall(callId)!.stateData.peerAudioMuted, undefined)
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

test('the caller keys the peer streams on the device that accepted, not on the first companion', async () => {
    const answered = '2222222222:88@lid'
    const companion = '2222222222:87@lid'
    for (const isVideo of [false, true]) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo })
        await manager.handleCallAck(
            buildOfferAckNode(callId, ['2222222222:0@lid', companion, answered, '1111111111:3@lid'])
        )

        await routeCallStanza(manager, deps, buildAcceptNode(callId, answered, '1111111111@lid'))

        const label = isVideo ? 'video' : 'audio'
        const plan = planOf(manager, callId)
        assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, answered), label)
        assert.deepEqual(
            plan.ssrcs?.peerVideoStreams,
            streamsOf(callId, answered, [
                WA_SSRC_SLOT.VIDEO.MAIN,
                WA_SSRC_SLOT.VIDEO.FEC,
                WA_SSRC_SLOT.VIDEO.OOB_NACK
            ]),
            label
        )
        const callKey = manager.getCall(callId)?.encryptionKey
        assert.ok(callKey)
        assert.deepEqual(plan.keys?.recv, derivePerJidSrtpKey(callKey, answered), label)
        if (isVideo) {
            assert.deepEqual(
                plan.ssrcs?.peerStreams,
                streamsOf(callId, answered, WA_VIDEO_CALL_SSRC_SLOTS),
                label
            )
        }
    }
})

test('the caller takes the answering device and its pid from the accept participant', async () => {
    const answered = '2222222222:88@lid'
    const { deps, stores } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo: true })
    await manager.handleCallAck(
        buildOfferAckNode(callId, ['2222222222:0@lid', '2222222222:87@lid', answered])
    )

    await routeCallStanza(
        manager,
        deps,
        buildAcceptNode(callId, '2222222222@lid', '1111111111@lid', [
            acceptRelayNode(answered, '3')
        ])
    )

    const plan = planOf(manager, callId)
    assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, answered))
    assert.deepEqual(plan.ssrcs?.peerStreams, streamsOf(callId, answered, WA_VIDEO_CALL_SSRC_SLOTS))
    assert.equal(manager.getCall(callId)?.relayData?.peerPid, 3)
})

test('an accept participant outside the called user is ignored, pid and all, for the sender', async () => {
    const answered = '2222222222:88@lid'
    for (const participant of ['3333333333:5@lid', '5511999990000:88@s.whatsapp.net']) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo: true })
        await manager.handleCallAck(
            buildOfferAckNode(callId, ['2222222222:0@lid', '2222222222:87@lid', answered])
        )

        await routeCallStanza(
            manager,
            deps,
            buildAcceptNode(callId, answered, '1111111111@lid', [acceptRelayNode(participant, '9')])
        )

        const plan = planOf(manager, callId)
        assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, answered), participant)
        assert.deepEqual(
            plan.ssrcs?.peerStreams,
            streamsOf(callId, answered, WA_VIDEO_CALL_SSRC_SLOTS),
            participant
        )
        assert.equal(manager.getCall(callId)?.relayData?.peerPid, 2, participant)
    }
})

test('an accept from the primary keys on it and sends accepted_elsewhere only to its companions', async () => {
    const primary = '2222222222:0@lid'
    const companions = ['2222222222:87@lid', '2222222222:88@lid']
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo: true })
    await manager.handleCallAck(
        buildOfferAckNode(callId, [primary, ...companions, '1111111111:3@lid'])
    )
    const before = sent.length

    await routeCallStanza(
        manager,
        deps,
        buildAcceptNode(callId, primary, '1111111111@lid', [acceptRelayNode(primary, '2')])
    )

    const plan = planOf(manager, callId)
    assert.equal(plan.ssrcs?.peerAudio, generateSecureSsrc(callId, primary))
    assert.deepEqual(plan.ssrcs?.peerStreams, streamsOf(callId, primary, WA_VIDEO_CALL_SSRC_SLOTS))
    const elsewhere = findByInnerTag(sent.slice(before), 'terminate')
        .filter((node) => (node.content as BinaryNode[])[0].attrs.reason === 'accepted_elsewhere')
        .map((node) => node.attrs.to)
    assert.deepEqual(elsewhere.sort(), [...companions].sort())
})

test('before any accept the caller subscribes every device of the peer, not one picked from the list', async () => {
    const devices = ['2222222222:0@lid', '2222222222:87@lid', '2222222222:88@lid']
    for (const isVideo of [false, true]) {
        const { deps, stores } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        const callId = await manager.startCall({ peerJid: '2222222222@lid', isVideo })

        await manager.handleCallAck(buildOfferAckNode(callId, [...devices, '1111111111:3@lid']))

        const label = isVideo ? 'video' : 'audio'
        const ssrcs = planOf(manager, callId).ssrcs
        for (const device of devices) {
            assert.ok(
                ssrcs?.peerStreams.includes(generateSecureSsrc(callId, device)),
                `${label} ${device}`
            )
            assert.ok(
                ssrcs?.peerAppData.includes(
                    generateSecureSsrc(callId, device, WA_SSRC_SLOT.APP_DATA.MAIN)
                ),
                `${label} ${device}`
            )
        }
        assert.notEqual(ssrcs?.peerAudio, generateSecureSsrc(callId, devices[1]), label)
    }
})

test('an incoming video call subscribes to the calling device, not to a companion of the caller', async () => {
    const caller = '2222222222:0@lid'
    const companions = ['2222222222:87@lid', '2222222222:88@lid']
    const { deps, stores } = createMockDeps()
    const sync = deps.signalDeviceSync as unknown as { syncDeviceList: () => Promise<unknown> }
    sync.syncDeviceList = async () => [{ deviceJids: [...companions, caller] }]
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = 'CA11CA11000000000000000000000060'
    const companionStreams = new Set(
        companions.flatMap((jid) => streamsOf(callId, jid, WA_VIDEO_CALL_SSRC_SLOTS))
    )

    await routeCallStanza(
        manager,
        deps,
        buildOfferNode(callId, caller, undefined, [VIDEO_OFFER_NODE])
    )
    const ringing = planOf(manager, callId).ssrcs
    assert.equal(ringing?.peerAudio, generateSecureSsrc(callId, caller))
    assert.ok(ringing?.peerStreams.every((ssrc) => !companionStreams.has(ssrc)))

    await manager.acceptCall(callId)
    const accepted = planOf(manager, callId).ssrcs
    assert.equal(accepted?.peerAudio, generateSecureSsrc(callId, caller))
    assert.deepEqual(accepted?.peerStreams, streamsOf(callId, caller, WA_VIDEO_CALL_SSRC_SLOTS))
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

/** A client torn down mid-offer must not ring, dial or send anything for it afterwards. */
test('an offer that resumes after the manager is destroyed makes no call and sends nothing', async () => {
    for (const stage of ['decrypting', 'setting up'] as const) {
        const { deps, stores, sent } = createMockDeps()
        const release = stage === 'decrypting' ? holdCallKeyDecrypt(deps) : holdDeviceSync(deps)
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const callId = 'CA11CA11000000000000000000000071'

        const offer = manager.handleCallOffer(
            buildOfferNode(callId, undefined, undefined, [CALL_KEY_ENC_NODE]),
            '2222222222@lid'
        )
        await settle()
        manager.destroy()
        release()
        await offer

        assert.equal(manager.getCall(callId), null, stage)
        assert.deepEqual(manager.getCalls(), [], stage)
        assert.deepEqual(tagsSentFor(sent, callId), [], stage)
    }
})

/** A client torn down while placing a call must not ring the peer for it afterwards. */
test('a call being placed when the manager is destroyed sends no offer and reports nothing', async (t) => {
    for (const stage of ['initMedia', 'buildOfferStanza'] as const) {
        const { deps, stores, sent } = createMockDeps()
        let release = (): void => {}
        if (stage === 'buildOfferStanza') {
            release = holdDeviceSync(deps)
        } else {
            const gate = new Promise<void>((resolve) => {
                release = resolve
            })
            const initMedia = WaCallMediaSession.prototype.initMedia
            t.mock.method(
                WaCallMediaSession.prototype,
                'initMedia',
                async function (this: WaCallMediaSession, selfLid: string, peerJid: string) {
                    await gate
                    return initMedia.call(this, selfLid, peerJid)
                }
            )
        }
        const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
        const emitted = recordEveryEmit(manager)

        const placing = manager.startCall({ peerJid: '2222222222@lid' })
        await settle()
        manager.destroy()
        release()

        await assert.rejects(placing, /destroyed/, stage)
        assert.deepEqual(findByInnerTag(sent, 'offer'), [], stage)
        assert.deepEqual(emitted, [], stage)
        assert.deepEqual(manager.getCalls(), [], stage)
        t.mock.restoreAll()
    }
})

/** Every event the manager emits, listened to or not. */
function recordEveryEmit(manager: WaCallManager): string[] {
    const emitted: string[] = []
    const emit = manager.emit.bind(manager)
    manager.emit = (event: string | symbol, ...args: unknown[]): boolean => {
        emitted.push(String(event))
        return emit(event, ...args)
    }
    return emitted
}

/** Holds the send of our offer open until released; `sent` records it as it leaves. */
function holdOfferSend(
    deps: WaVoipDeps,
    sent: BinaryNode[],
    failTerminate = false
): { offered: Promise<void>; release: () => void } {
    let release!: () => void
    let offeredNow!: () => void
    const gate = new Promise<void>((resolve) => {
        release = resolve
    })
    const offered = new Promise<void>((resolve) => {
        offeredNow = resolve
    })
    const coordinator = deps.lowLevelCoordinator as unknown as {
        sendNode: (node: BinaryNode) => Promise<void>
    }
    coordinator.sendNode = async (node) => {
        sent.push(node)
        const tag = (node.content as BinaryNode[] | undefined)?.[0]?.tag
        if (tag === 'offer') {
            offeredNow()
            await gate
        }
        if (tag === 'terminate' && failTerminate) throw new Error('socket closing')
    }
    return { offered, release }
}

/** The offer left before `destroy` ran: the peer is ringing, and only a terminate stops it. */
test('an offer already sent when the manager is destroyed is withdrawn with a terminate', async () => {
    const { deps, stores, sent } = createMockDeps()
    const { offered, release } = holdOfferSend(deps, sent)
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })
    const emitted = recordEveryEmit(manager)

    const placing = manager.startCall({ peerJid: '2222222222@lid' })
    await offered
    manager.destroy()
    release()

    await assert.rejects(placing, /destroyed/)
    const [offer] = findByInnerTag(sent, 'offer')
    assert.ok(offer)
    const callId = callIdOf(offer)
    assert.ok(callId)
    assert.deepEqual(tagsSentFor(sent, callId), ['offer', 'terminate'])
    const terminate = findByInnerTag(sent, 'terminate')[0]
    assert.equal(terminate.attrs.to, '2222222222@lid')
    assert.deepEqual((terminate.content as BinaryNode[])[0].attrs, {
        'call-id': callId,
        'call-creator': '1111111111@lid'
    })
    assert.deepEqual(emitted, [])
    assert.deepEqual(manager.getCalls(), [])
})

/** A logger whose warnings, its children's included, are kept with their bound context. */
function recordWarnings(
    bindings: Readonly<Record<string, unknown>> = {},
    warnings: Array<[string, Record<string, unknown>]> = []
): { logger: Logger; warnings: Array<[string, Record<string, unknown>]> } {
    const logger: Logger = {
        ...createNoopLogger(),
        warn: (message, context) => {
            warnings.push([message, { ...bindings, ...context }])
        },
        child: (more) => recordWarnings({ ...bindings, ...more }, warnings).logger
    }
    return { logger, warnings }
}

test('a withdrawing terminate that fails to send is logged, not thrown, and the call is cleaned up', async (t) => {
    const { deps, stores, sent } = createMockDeps()
    const { offered, release } = holdOfferSend(deps, sent, true)
    const cleanup = t.mock.method(WaCallMediaSession.prototype, 'cleanup')
    const { logger, warnings } = recordWarnings()
    const manager = new WaCallManager({ deps, stores, logger, maxConcurrentCalls: 1 })

    const placing = manager.startCall({ peerJid: '2222222222@lid' })
    await offered
    manager.destroy()
    const cleanedByDestroy = cleanup.mock.callCount()
    release()

    await assert.rejects(placing, /call manager destroyed/)
    const callId = callIdOf(findByInnerTag(sent, 'offer')[0])
    assert.equal(findByInnerTag(sent, 'terminate').length, 1)
    assert.deepEqual(warnings, [
        ['terminate of an offer sent during destroy failed', { callId, message: 'socket closing' }]
    ])
    assert.equal(cleanup.mock.callCount(), cleanedByDestroy + 1)
    assert.deepEqual(manager.getCalls(), [])
})

test('a call placed without a destroy sends its offer and no terminate', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1 })

    const callId = await manager.startCall({ peerJid: '2222222222@lid' })

    assert.deepEqual(tagsSentFor(sent, callId), ['offer'])
    assert.equal(manager.getCall(callId)?.stateData.state, CallState.Ringing)
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

test('the relaylatency a caller sends on the preaccept names only the relays it dials', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    await manager.handleCallAck(
        buildOfferAckNode(
            callId,
            ['2222222222:0@lid', '1111111111:3@lid'],
            [
                { name: 'tcp1c01', ip: [10, 0, 0, 2], protocol: '1', c2rRtt: 5 },
                { name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 }
            ]
        )
    )
    const before = sent.length

    await routeCallStanza(manager, deps, {
        tag: 'call',
        attrs: { from: '2222222222:0@lid', id: 'PREACCEPTMSGID' },
        content: [
            { tag: 'preaccept', attrs: { 'call-id': callId, 'call-creator': '1111111111@lid' } }
        ]
    })

    const advertised = findByInnerTag(sent.slice(before), 'relaylatency').flatMap((node) =>
        ((node.content as BinaryNode[])[0].content as BinaryNode[])
            .filter((child) => child.tag === 'te')
            .map((te) => [te.attrs.relay_name, te.attrs.latency, te.content])
    )
    assert.deepEqual(advertised, [
        ['gru1c01', String(0x2000000 + 17), new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])]
    ])
})

function preacceptNode(callId: string, from: string): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: `PREACCEPT${from}` },
        content: [
            { tag: 'preaccept', attrs: { 'call-id': callId, 'call-creator': '1111111111@lid' } }
        ]
    }
}

/** The relay names our `<te>` nodes carried, one entry per node sent. */
function announcedRelayNames(sent: readonly BinaryNode[]): string[] {
    return findByInnerTag(sent, 'relaylatency').flatMap((node) =>
        ((node.content as BinaryNode[])[0].content as BinaryNode[])
            .filter((child) => child.tag === 'te')
            .map((te) => te.attrs.relay_name)
    )
}

test('a caller announces each relay once, however many devices of the peer preaccept', async () => {
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    await manager.handleCallAck(
        buildOfferAckNode(
            callId,
            ['2222222222@lid'],
            [
                { name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 },
                { name: 'gig4c02', ip: [10, 0, 0, 2], c2rRtt: 25 }
            ]
        )
    )
    const before = sent.length

    await routeCallStanza(manager, deps, preacceptNode(callId, '2222222222:0@lid'))
    await routeCallStanza(manager, deps, preacceptNode(callId, '2222222222:5@lid'))

    assert.deepEqual(announcedRelayNames(sent.slice(before)), ['gru1c01', 'gig4c02'])
})

function peerRelaylatencyNode(callId: string, from: string, latency: number): BinaryNode {
    return {
        tag: 'call',
        attrs: { from, id: `RELAYLATENCY${latency}` },
        content: [
            {
                tag: 'relaylatency',
                attrs: { 'call-id': callId, 'call-creator': from },
                content: [
                    {
                        tag: 'te',
                        attrs: { relay_name: 'gru1c01', latency: String(latency) },
                        content: new Uint8Array([10, 9, 9, 9, 0x0d, 0x96])
                    }
                ]
            }
        ]
    }
}

test('after setup a call sends no relaylatency, however many the peer sends', async () => {
    const relays = [
        { name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17 },
        { name: 'gig4c02', ip: [10, 0, 0, 2], c2rRtt: 25 }
    ] as const
    const peer = '2222222222:0@lid'
    for (const direction of ['outgoing', 'incoming'] as const) {
        const { deps, stores, sent } = createMockDeps()
        const manager = new WaCallManager({
            deps,
            stores,
            maxConcurrentCalls: 1,
            mediaMode: 'remote'
        })
        let callId = 'CA11CA110000000000000000000000A0'
        if (direction === 'outgoing') {
            callId = await manager.startCall({ peerJid: '2222222222@lid' })
            await manager.handleCallAck(buildOfferAckNode(callId, ['2222222222@lid'], relays))
            await routeCallStanza(manager, deps, preacceptNode(callId, peer))
        } else {
            const relayNode = (buildOfferAckNode(callId, [], relays).content as BinaryNode[])[0]
            await routeCallStanza(
                manager,
                deps,
                buildOfferNode(callId, peer, undefined, [relayNode])
            )
        }
        assert.deepEqual(announcedRelayNames(sent), ['gru1c01', 'gig4c02'], direction)
        const afterSetup = sent.length

        for (let i = 0; i < 5; i++) {
            await routeCallStanza(manager, deps, peerRelaylatencyNode(callId, peer, 0x2000000 + i))
        }

        assert.deepEqual(findByInnerTag(sent.slice(afterSetup), 'relaylatency'), [], direction)
    }
})

test('a relay reachable over IPv4 and IPv6 is announced once, by its IPv4 address', async () => {
    const ipv6 = [0x26, 0x20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0x0d, 0x96]
    const { deps, stores, sent } = createMockDeps()
    const manager = new WaCallManager({ deps, stores, maxConcurrentCalls: 1, mediaMode: 'remote' })
    const callId = await manager.startCall({ peerJid: '2222222222@lid' })
    await manager.handleCallAck(
        buildOfferAckNode(
            callId,
            ['2222222222@lid'],
            [{ name: 'gru1c01', ip: [10, 0, 0, 1], c2rRtt: 17, ipv6 }]
        )
    )
    const before = sent.length

    await routeCallStanza(manager, deps, preacceptNode(callId, '2222222222:0@lid'))

    const te = findByInnerTag(sent.slice(before), 'relaylatency').flatMap((node) =>
        ((node.content as BinaryNode[])[0].content as BinaryNode[]).filter(
            (child) => child.tag === 'te'
        )
    )
    assert.deepEqual(
        te.map((node) => [node.attrs.relay_name, node.content]),
        [['gru1c01', new Uint8Array([10, 0, 0, 1, 0x0d, 0x96])]]
    )
})
