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
    type WaCallMediaEventMessage,
    type WaCallMediaMessage,
    WaCallMediaMessageSequencer,
    WaCallMediaReceiver
} from '../remote.js'

const CALL_ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

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
