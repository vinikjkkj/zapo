import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { WaCallMediaPlanUpdate } from '../plan.js'
import {
    decodeCallMediaEvent,
    decodeCallMediaMessage,
    encodeCallMediaEvent,
    encodeCallMediaMessage,
    WA_CALL_MEDIA_FEATURE_GROUP,
    WA_CALL_MEDIA_FEATURE_RAW_UDP,
    WA_CALL_MEDIA_WIRE_VERSION,
    type WaCallMediaEventMessage,
    type WaCallMediaMessage,
    WaCallMediaMessageSequencer,
    WaCallMediaReceiver
} from '../remote.js'

const CALL_ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/** The relay's whole 0x0802 keepalive answer: type, zero length, magic cookie, transaction id. */
const PONG = new Uint8Array([0x08, 0x02, 0x00, 0x00, 0x21, 0x12, 0xa4, 0x42, ...new Uint8Array(12)])

const KEYED_PLAN: WaCallMediaPlanUpdate = {
    keys: {
        epoch: 1,
        send: { masterKey: new Uint8Array(16).fill(1), masterSalt: new Uint8Array(14).fill(2) },
        recv: { masterKey: new Uint8Array(16).fill(3), masterSalt: new Uint8Array(14).fill(4) }
    },
    relays: {
        endpoints: [
            {
                ip: '10.0.0.1',
                port: 3478,
                token: 'token',
                rawToken: new Uint8Array([0, 255, 128]),
                key: 'relay-key',
                relayId: 1
            }
        ]
    }
}

/** The byte arrays are the whole point: JSON has no binary type to carry them. */
test('a plan message survives its text form, byte arrays included', () => {
    const message: WaCallMediaMessage = {
        v: 1,
        callId: CALL_ID,
        seq: 3,
        full: false,
        plan: KEYED_PLAN
    }

    const decoded = decodeCallMediaMessage(encodeCallMediaMessage(message))

    assert.deepEqual(decoded, message)
    assert.ok(decoded.plan.keys?.send.masterKey instanceof Uint8Array)
    assert.ok(decoded.plan.relays?.endpoints[0].rawToken instanceof Uint8Array)
})

const GROUP_PLAN: WaCallMediaPlanUpdate = {
    relays: {
        endpoints: [
            {
                ip: '10.0.0.2',
                port: 3478,
                token: 'token',
                rawToken: new Uint8Array([9, 8, 7]),
                key: 'relay-key',
                relayId: 2,
                transport: 'raw-udp'
            }
        ],
        selfPid: 1,
        generation: 1
    },
    ssrcs: {
        selfAudio: 1,
        selfVideo: 2,
        selfAppData: 6,
        selfStreams: [1, 6],
        selfVideoStreams: [2],
        peerAudio: 0,
        peerStreams: [],
        peerVideoStreams: [],
        peerAppData: [16, 26],
        selfLayers: [
            { layer: 0, ssrcs: [1, 3, 4] },
            { layer: 5, ssrcs: [6] }
        ]
    },
    group: {
        senders: [
            {
                id: 'sender-a',
                audio: 11,
                streams: [11, 13, 14, 16],
                recv: {
                    masterKey: new Uint8Array(16).fill(5),
                    masterSalt: new Uint8Array(14).fill(6)
                }
            }
        ]
    }
}

test('the group sections survive their text form under wire version 1', () => {
    const message: WaCallMediaMessage = {
        v: WA_CALL_MEDIA_WIRE_VERSION,
        callId: CALL_ID,
        seq: 0,
        full: true,
        plan: GROUP_PLAN
    }

    const decoded = decodeCallMediaMessage(encodeCallMediaMessage(message))

    assert.equal(WA_CALL_MEDIA_WIRE_VERSION, 1)
    assert.deepEqual(decoded, message)
    assert.ok(decoded.plan.group?.senders[0].recv.masterKey instanceof Uint8Array)
})

/** What an older host does with sections it does not know: the decoder lets them through. */
test('a version 1 decoder takes a message with sections it does not know', () => {
    const text = JSON.stringify({
        v: 1,
        callId: CALL_ID,
        seq: 2,
        full: false,
        plan: { muted: true, group: { senders: [] }, futureSection: { x: 1 } }
    })

    const decoded = decodeCallMediaMessage(text)

    assert.equal(decoded.plan.muted, true)
    assert.deepEqual(decoded.plan.group, { senders: [] })
})

test('a host event survives its text form, and an unknown event type still decodes', () => {
    const host: WaCallMediaEventMessage = {
        v: 1,
        callId: CALL_ID,
        event: {
            type: 'host',
            features: [WA_CALL_MEDIA_FEATURE_GROUP, WA_CALL_MEDIA_FEATURE_RAW_UDP]
        }
    }

    assert.deepEqual(decodeCallMediaEvent(encodeCallMediaEvent(host)), host)
    assert.equal(
        decodeCallMediaEvent(JSON.stringify({ v: 1, callId: CALL_ID, event: { type: 'later' } }))
            .event.type,
        'later'
    )
})

test('an event message survives its text form', () => {
    const message: WaCallMediaEventMessage = {
        v: 1,
        callId: CALL_ID,
        event: { type: 'relay_lost', reason: 'closed' }
    }

    assert.deepEqual(decodeCallMediaEvent(encodeCallMediaEvent(message)), message)
})

test('a message of another wire version or without a call is refused', () => {
    assert.throws(
        () =>
            decodeCallMediaMessage(
                JSON.stringify({ v: 2, callId: CALL_ID, seq: 0, full: true, plan: {} })
            ),
        /wire version/
    )
    assert.throws(
        () => decodeCallMediaMessage(JSON.stringify({ v: 1, seq: 0, full: true, plan: {} })),
        /call id/
    )
    assert.throws(
        () =>
            decodeCallMediaMessage(
                JSON.stringify({ v: 1, callId: CALL_ID, seq: -1, full: true, plan: {} })
            ),
        /seq/
    )
    assert.throws(() => decodeCallMediaEvent(JSON.stringify({ v: 1, callId: CALL_ID })), /type/)
})

test('the sequencer sends the whole plan first and only the changes after', () => {
    const sequencer = new WaCallMediaMessageSequencer(CALL_ID)

    const first = sequencer.next({ mediaType: 'audio' })
    const second = sequencer.next({ muted: true })

    assert.deepEqual([first.seq, first.full, first.plan], [0, true, { mediaType: 'audio' }])
    assert.deepEqual([second.seq, second.full, second.plan], [1, false, { muted: true }])
    assert.deepEqual(sequencer.snapshot().plan, { mediaType: 'audio', muted: true })
})

interface ReceiverHarness {
    readonly receiver: WaCallMediaReceiver
    readonly applied: WaCallMediaPlanUpdate[]
    readonly sent: WaCallMediaEventMessage[]
}

function createReceiver(): ReceiverHarness {
    const sent: WaCallMediaEventMessage[] = []
    const receiver = new WaCallMediaReceiver({
        callId: CALL_ID,
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        send: (message) => {
            sent.push(message)
        }
    })
    assert.equal(sent.shift()?.event.type, 'host')
    const applied: WaCallMediaPlanUpdate[] = []
    ;(receiver.plane as unknown as { apply(update: WaCallMediaPlanUpdate): Promise<void> }).apply =
        (update) => {
            applied.push(update)
            return Promise.resolve()
        }
    return { receiver, applied, sent }
}

function message(seq: number, full: boolean, plan: WaCallMediaPlanUpdate): WaCallMediaMessage {
    return { v: 1, callId: CALL_ID, seq, full, plan }
}

test('the receiver applies messages in order and drops the ones it already has', async () => {
    const { receiver, applied, sent } = createReceiver()

    await receiver.receive(message(0, true, { mediaType: 'audio' }))
    await receiver.receive(message(1, false, { muted: true }))
    await receiver.receive(message(1, false, { muted: false }))

    assert.deepEqual(applied, [{ mediaType: 'audio' }, { muted: true }])
    assert.deepEqual(sent, [])
    receiver.stop()
})

/** The missing messages may have carried sections this one lacks. */
test('a gap in the numbers is applied and the whole plan asked for again', async () => {
    const { receiver, applied, sent } = createReceiver()
    await receiver.receive(message(0, true, { mediaType: 'audio' }))

    await receiver.receive(message(3, false, { muted: true }))

    assert.deepEqual(applied.at(-1), { muted: true })
    assert.deepEqual(sent, [{ v: 1, callId: CALL_ID, event: { type: 'resync', lastSeq: 0 } }])
    receiver.stop()
})

test('a message whose apply fails is not counted, so the next one asks for a resync', async () => {
    const { receiver, sent } = createReceiver()
    const plane = receiver.plane as unknown as {
        apply(update: WaCallMediaPlanUpdate): Promise<void>
    }
    await receiver.receive(message(0, true, { mediaType: 'audio' }))
    const apply = plane.apply
    plane.apply = () => Promise.reject(new Error('bad keys'))
    await assert.rejects(receiver.receive(message(1, false, { muted: true })), /bad keys/)
    plane.apply = apply

    await receiver.receive(message(2, false, { muted: false }))

    assert.deepEqual(
        sent.map((event) => event.event),
        [{ type: 'resync', lastSeq: 0 }]
    )
    receiver.stop()
})

test('messages handed in without waiting apply in order and ask for nothing', async () => {
    const { receiver, applied, sent } = createReceiver()

    await Promise.all([
        receiver.receive(message(0, true, { mediaType: 'audio' })),
        receiver.receive(message(1, false, { muted: true })),
        receiver.receive(message(2, false, { muted: false }))
    ])

    assert.deepEqual(applied, [{ mediaType: 'audio' }, { muted: true }, { muted: false }])
    assert.deepEqual(sent, [])
    receiver.stop()
})

test('a change that arrives before any whole plan asks for one', async () => {
    const { receiver, sent } = createReceiver()

    await receiver.receive(message(4, false, { muted: true }))

    assert.deepEqual(
        sent.map((event) => event.event),
        [{ type: 'resync', lastSeq: null }]
    )
    receiver.stop()
})

test('a whole plan older than the last one applied is dropped', async () => {
    const { receiver, applied } = createReceiver()
    await receiver.receive(message(5, true, { muted: true }))

    await receiver.receive(message(2, true, { muted: false }))

    assert.deepEqual(applied, [{ muted: true }])
    receiver.stop()
})

test('a message for another call is refused', async () => {
    const { receiver } = createReceiver()

    await assert.rejects(
        receiver.receive({ ...message(0, true, {}), callId: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB' }),
        /expected/
    )
    receiver.stop()
})

test('the plane reporting its relay lost goes back to signaling as an event', () => {
    const { receiver, sent } = createReceiver()

    ;(
        receiver.plane as unknown as { sctpRelay: { announceLastLegLost(reason: string): void } }
    ).sctpRelay.announceLastLegLost('ice_connection_failed')

    assert.deepEqual(sent, [
        { v: 1, callId: CALL_ID, event: { type: 'relay_lost', reason: 'ice_connection_failed' } }
    ])
    receiver.stop()
})

/** `JSON.stringify` refuses a `bigint`, and a reaction's transaction id is a uint64. */
test('a reaction event survives its text form, bigint transaction id included', () => {
    const message: WaCallMediaEventMessage = {
        v: 1,
        callId: CALL_ID,
        event: {
            type: 'reaction',
            reaction: { transactionId: 18_446_744_073_709_551_615n, reaction: '🔥' }
        }
    }

    const decoded = decodeCallMediaEvent(encodeCallMediaEvent(message))

    assert.deepEqual(decoded, message)
    assert.equal(
        decoded.event.type === 'reaction' && typeof decoded.event.reaction.transactionId,
        'bigint'
    )
})

test('a reaction the plane receives goes back to signaling as an event that encodes', () => {
    const { receiver, sent } = createReceiver()
    const events = (
        receiver.plane as unknown as {
            events: { onReaction(reaction: { transactionId: bigint; reaction: string }): void }
        }
    ).events

    events.onReaction({ transactionId: 7n, reaction: '👍' })

    assert.equal(sent.length, 1)
    const decoded = decodeCallMediaEvent(encodeCallMediaEvent(sent[0]))
    assert.deepEqual(decoded.event, {
        type: 'reaction',
        reaction: { transactionId: 7n, reaction: '👍' }
    })
    receiver.stop()
})

test('a relay that answers the plane goes back to signaling once, as an event that encodes', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] })
    const sent: WaCallMediaEventMessage[] = []
    const answers: Array<() => void> = []
    const receiver = new WaCallMediaReceiver({
        callId: CALL_ID,
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        now: () => 0,
        createRawUdpLeg: (options) => {
            let open = false
            answers.push(() => options.onMessage(PONG.slice()))
            return {
                get isOpen() {
                    return open
                },
                open: () => {
                    open = true
                    options.onOpen()
                },
                send: () => open,
                close: () => {
                    open = false
                }
            }
        },
        send: (message) => {
            sent.push(message)
        }
    })
    t.after(() => receiver.stop())
    sent.length = 0
    const relays = KEYED_PLAN.relays!
    await receiver.receive(
        message(0, true, {
            relays: { endpoints: [{ ...relays.endpoints[0], name: 'gru1c01' }] }
        })
    )

    answers[0]()
    answers[0]()

    assert.deepEqual(
        sent.map((event) => decodeCallMediaEvent(encodeCallMediaEvent(event)).event),
        [{ type: 'relay_answered', name: 'gru1c01', rttMs: 0 }]
    )
})

/** Signaling reads the relays that answered from a host that says it reports them. */
test('a host going active says it reports the relays that answer', () => {
    const { receiver, sent } = createReceiver()

    ;(receiver.plane as unknown as { events: { onActive(): void } }).events.onActive()

    assert.deepEqual(
        sent.map((event) => event.event),
        [{ type: 'active', reportsRelayAnswers: true }]
    )
    receiver.stop()
})

/** Sent before anything else, so signaling knows an older host by its first other event. */
test('a host announces what it applies before any other event', () => {
    const plain: WaCallMediaEventMessage[] = []
    const plainReceiver = new WaCallMediaReceiver({
        callId: CALL_ID,
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        send: (message) => {
            plain.push(message)
        }
    })
    const raw: WaCallMediaEventMessage[] = []
    const rawReceiver = new WaCallMediaReceiver({
        callId: CALL_ID,
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        createRawUdpLeg: () => {
            throw new Error('not dialled')
        },
        send: (message) => {
            raw.push(message)
        }
    })

    assert.deepEqual(
        plain.map((message) => message.event),
        [{ type: 'host', features: ['group/1', 'group-attribution/1'] }]
    )
    assert.deepEqual(
        raw.map((message) => message.event),
        [{ type: 'host', features: ['group/1', 'group-attribution/1', 'raw-udp'] }]
    )
    plainReceiver.stop()
    rawReceiver.stop()
})

test('a reaction names its sender and a sender_media event survives its text form', () => {
    const messages: WaCallMediaEventMessage[] = [
        {
            v: 1,
            callId: CALL_ID,
            event: {
                type: 'reaction',
                reaction: { transactionId: 3n, reaction: '👍' },
                senderId: 'a'
            }
        },
        { v: 1, callId: CALL_ID, event: { type: 'sender_media', senderId: 'a', receiving: false } }
    ]

    for (const message of messages) {
        assert.deepEqual(decodeCallMediaEvent(encodeCallMediaEvent(message)), message)
    }
})

/** What an older host sends: no sender on the reaction, which signaling reads as unknown. */
test('a reaction from a host that names no sender decodes without one', () => {
    const decoded = decodeCallMediaEvent(
        JSON.stringify({
            v: 1,
            callId: CALL_ID,
            event: {
                type: 'reaction',
                reaction: { transactionId: { $bigint: '9' }, reaction: '🔥' }
            }
        })
    )

    assert.equal(decoded.event.type, 'reaction')
    assert.equal(decoded.event.type === 'reaction' && decoded.event.senderId, undefined)
})

test('the receiver forwards the sender of a reaction, and a listener without it still fits', () => {
    const heard: string[] = []
    const sent: WaCallMediaEventMessage[] = []
    const receiver = new WaCallMediaReceiver({
        callId: CALL_ID,
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        onReaction: (reaction: { reaction: string }) => heard.push(reaction.reaction),
        send: (message) => {
            sent.push(message)
        }
    })
    const events = (
        receiver.plane as unknown as {
            events: { onReaction(reaction: unknown, senderId?: string): void }
        }
    ).events

    events.onReaction({ transactionId: 1n, reaction: '👍' }, 'b')
    events.onReaction({ transactionId: 2n, reaction: '🔥' })

    assert.deepEqual(heard, ['👍', '🔥'])
    assert.deepEqual(
        sent.slice(1).map((message) => message.event),
        [
            { type: 'reaction', reaction: { transactionId: 1n, reaction: '👍' }, senderId: 'b' },
            { type: 'reaction', reaction: { transactionId: 2n, reaction: '🔥' } }
        ]
    )
    receiver.stop()
})

test('a sender the plane hears or loses goes back to signaling as sender_media', () => {
    const { receiver, sent } = createReceiver()
    const events = (
        receiver.plane as unknown as {
            events: { onSenderMedia(senderId: string, receiving: boolean): void }
        }
    ).events

    events.onSenderMedia('a', true)
    events.onSenderMedia('a', false)

    assert.deepEqual(
        sent.map((message) => message.event),
        [
            { type: 'sender_media', senderId: 'a', receiving: true },
            { type: 'sender_media', senderId: 'a', receiving: false }
        ]
    )
    receiver.stop()
})

/** The relay's answer to a video subscription is not confirmed, so a host says it only when asked. */
test('a host announces video subscriptions only when built to apply them', () => {
    const sent: WaCallMediaEventMessage[] = []
    const receiver = new WaCallMediaReceiver({
        callId: CALL_ID,
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        videoSubscriptions: true,
        send: (message) => {
            sent.push(message)
        }
    })

    assert.deepEqual(sent[0].event, {
        type: 'host',
        features: ['group/1', 'group-attribution/1', 'group-video/1']
    })
    receiver.stop()
})
