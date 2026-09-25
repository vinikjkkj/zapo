import assert from 'node:assert/strict'
import test from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { bytesToHex } from '../../bytes.js'
import type { RtpPacket } from '../../media/rtp.js'
import { decodeAppDataPayload, encodeReactionPayload } from '../protocol.js'
import { WA_APP_DATA_PAYLOAD_TYPE, WaAppDataStream } from '../WaAppDataStream.js'

const SSRC = 0x0c87cbd9
/** Two devices of the peer, each numbering its own reactions from one. */
const PEER_SSRC = 0x03a9bd2e
const OTHER_PEER_SSRC = 0x8ffe17b1
const PEER_PAYLOAD_TYPE = 108
const THUMBS_UP = '\u{1F44D}'

/**
 * The first reaction of a stream, byte for byte: `payloads.messages` (field 1, length
 * delimited) around `reactionInfo` (field 1) holding `transaction_id = 1` (field 1,
 * varint) and the thumbs-up glyph as UTF-8 (field 2). Written out rather than produced by
 * the encoder, which is what this pins.
 */
const FIRST_REACTION_PAYLOAD_HEX = '0a0a0a0808011204f09f918d'

interface Harness {
    readonly stream: WaAppDataStream
    readonly sent: RtpPacket[]
}

function createStream(options: { payloadType?: number; clearIntervalMs?: number } = {}): Harness {
    const sent: RtpPacket[] = []
    const stream = new WaAppDataStream({
        logger: createNoopLogger(),
        ssrc: SSRC,
        payloadType: options.payloadType,
        retransmissionIntervalMs: 5,
        clearIntervalMs: options.clearIntervalMs ?? 10_000,
        sendPacket: (packet) => {
            sent.push(packet)
            return true
        }
    })
    return { stream, sent }
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

test('a reaction goes out before the peer has sent one of its own', () => {
    const { stream, sent } = createStream()

    // Nothing negotiates the payload type: each side registers its own and the
    // offer carries none, so a sender never has to wait to learn one.
    assert.equal(stream.peerPayloadType, null)
    assert.equal(stream.payloadType, WA_APP_DATA_PAYLOAD_TYPE)

    assert.equal(stream.sendReaction(THUMBS_UP), true)
    assert.equal(sent.length, 1)
    assert.equal(sent[0].header.payloadType, WA_APP_DATA_PAYLOAD_TYPE)
    assert.equal(sent[0].header.ssrc, SSRC)

    stream.close()
})

test("the peer's payload type is recorded without changing what this side sends", () => {
    const { stream, sent } = createStream()

    stream.observeInboundPayloadType(PEER_PAYLOAD_TYPE)
    assert.equal(stream.peerPayloadType, PEER_PAYLOAD_TYPE)
    assert.equal(
        stream.payloadType,
        WA_APP_DATA_PAYLOAD_TYPE,
        'what the peer stamps on its own stream does not choose ours'
    )

    assert.equal(stream.sendReaction(THUMBS_UP), true)
    assert.equal(sent[0].header.payloadType, WA_APP_DATA_PAYLOAD_TYPE)

    stream.close()
})

test('a configured payload type wins over the default', () => {
    const { stream } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.observeInboundPayloadType(PEER_PAYLOAD_TYPE + 1)

    assert.equal(stream.payloadType, PEER_PAYLOAD_TYPE)
    stream.close()
})

test('an outgoing reaction carries the emoji this session sent', () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.sendReaction(THUMBS_UP)
    const decoded = decodeAppDataPayload(sent[0].payload)

    assert.equal(decoded?.items[0]?.reaction?.reaction, THUMBS_UP)
    stream.close()
})

test('the first reaction of a stream serializes to the expected bytes', () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.sendReaction(THUMBS_UP)

    assert.equal(bytesToHex(sent[0].payload), FIRST_REACTION_PAYLOAD_HEX)
    stream.close()
})

test('a reaction is retransmitted with the same bytes and a fresh sequence number', async () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.sendReaction(THUMBS_UP)
    await wait(30)
    stream.close()

    assert.ok(sent.length > 1, `expected a retransmission, got ${sent.length} packets`)
    const first = sent[0]
    for (const packet of sent.slice(1)) {
        assert.equal(bytesToHex(packet.payload), bytesToHex(first.payload))
        assert.equal(packet.header.ssrc, first.header.ssrc)
    }
    const sequences = new Set(sent.map((packet) => packet.header.sequenceNumber))
    assert.equal(sequences.size, sent.length)
})

test('the send buffer empties once the clear interval elapses', async () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE, clearIntervalMs: 20 })

    stream.sendReaction(THUMBS_UP)
    await wait(60)
    const afterClear = sent.length
    await wait(30)

    assert.equal(sent.length, afterClear, 'retransmission kept running past the clear interval')
    stream.close()
})

test('a second reaction replaces the one still in the send buffer', async () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.sendReaction(THUMBS_UP)
    stream.sendReaction('\u{1F602}')
    await wait(20)
    stream.close()

    const reactions = new Set(
        sent.map((packet) => decodeAppDataPayload(packet.payload)?.items[0]?.reaction?.reaction)
    )

    assert.deepEqual(Array.from(reactions).sort(), [THUMBS_UP, '\u{1F602}'].sort())
    const tail = sent.slice(1)
    for (const packet of tail) {
        assert.equal(
            decodeAppDataPayload(packet.payload)?.items[0]?.reaction?.reaction,
            '\u{1F602}'
        )
    }
})

test('a retransmitted reaction is reported once', () => {
    const { stream } = createStream()
    const payload = encodeReactionPayload({ transactionId: 99n, reaction: THUMBS_UP })

    const first = stream.receive(payload, PEER_SSRC)
    const second = stream.receive(payload, PEER_SSRC)
    const third = stream.receive(payload, PEER_SSRC)

    assert.equal(first.length, 1)
    assert.equal(first[0].reaction, THUMBS_UP)
    assert.equal(second.length, 0)
    assert.equal(third.length, 0)
    stream.close()
})

test('two reactions with distinct transaction ids are both reported', () => {
    const { stream } = createStream()

    assert.equal(
        stream.receive(encodeReactionPayload({ transactionId: 1n, reaction: THUMBS_UP }), PEER_SSRC)
            .length,
        1
    )
    assert.equal(
        stream.receive(encodeReactionPayload({ transactionId: 2n, reaction: THUMBS_UP }), PEER_SSRC)
            .length,
        1
    )
    stream.close()
})

/**
 * The transaction id counts within one sender: every device starts at 1, so two devices of
 * the peer reacting on the same call collide on their first reaction unless the stream it
 * arrived on is part of the dedup key.
 */
test('two devices of the peer reacting under the same id are both reported', () => {
    const { stream } = createStream()
    const payload = encodeReactionPayload({ transactionId: 1n, reaction: THUMBS_UP })

    assert.equal(stream.receive(payload, PEER_SSRC).length, 1)
    assert.equal(stream.receive(payload, OTHER_PEER_SSRC).length, 1)
    assert.equal(stream.receive(payload, PEER_SSRC).length, 0, 'still deduped per stream')
    stream.close()
})

test('an unreadable payload yields no reaction and does not throw', () => {
    const { stream } = createStream()

    assert.deepEqual(stream.receive(new Uint8Array([0xff, 0xff]), PEER_SSRC), [])
    assert.deepEqual(stream.receive(new Uint8Array(0), PEER_SSRC), [])
    stream.close()
})

/**
 * The announcement is not an instruction. A reaction from the reference client
 * on a call whose settings announce SFrame arrives readable with the end-to-end
 * keys alone, so withholding on the flag alone would silence every reaction
 * this side sends on most calls, for a layer the peer is not applying either.
 */
test('the sframe announcement alone does not withhold a reaction', () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.setSframe(true, null)

    assert.equal(stream.sendReaction(THUMBS_UP), true)
    assert.equal(sent.length, 1)
    const decoded = decodeAppDataPayload(sent[0].payload)
    assert.equal(
        decoded?.items[0]?.reaction?.reaction,
        THUMBS_UP,
        'the payload goes out as the plain envelope, with nothing wrapped around it'
    )
    stream.close()
})

test('the sframe transform wraps the payload when one is supplied', () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })
    const trailer = new Uint8Array([0xaa, 0xbb])

    stream.setSframe(true, (payload) => {
        const wrapped = new Uint8Array(payload.length + trailer.length)
        wrapped.set(payload)
        wrapped.set(trailer, payload.length)
        return wrapped
    })

    assert.equal(stream.sendReaction(THUMBS_UP), true)
    assert.equal(bytesToHex(sent[0].payload.subarray(-2)), 'aabb')
    stream.close()
})

test('sframe off leaves the serialized message in the clear', () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.setSframe(false, null)
    stream.sendReaction(THUMBS_UP)

    assert.equal(decodeAppDataPayload(sent[0].payload)?.items[0]?.reaction?.reaction, THUMBS_UP)
    stream.close()
})

/**
 * A transport that took nothing must be reported as such, and the reaction must survive
 * it: the send buffer holds it and the retransmission carries it once a connection is up.
 */
test('a refused first attempt is reported and then retransmitted', async () => {
    const sent: RtpPacket[] = []
    let accepting = false
    const stream = new WaAppDataStream({
        logger: createNoopLogger(),
        ssrc: SSRC,
        retransmissionIntervalMs: 5,
        clearIntervalMs: 10_000,
        sendPacket: (packet) => {
            if (!accepting) return false
            sent.push(packet)
            return true
        }
    })

    assert.equal(stream.sendReaction(THUMBS_UP), false)
    assert.equal(sent.length, 0)

    accepting = true
    await wait(30)
    stream.close()

    assert.ok(sent.length > 0, 'the buffered reaction went out once the transport took it')
    assert.equal(bytesToHex(sent[0].payload), FIRST_REACTION_PAYLOAD_HEX)
})

test('closing the stream stops the retransmission', async () => {
    const { stream, sent } = createStream({ payloadType: PEER_PAYLOAD_TYPE })

    stream.sendReaction(THUMBS_UP)
    stream.close()
    const afterClose = sent.length
    await wait(30)

    assert.equal(sent.length, afterClose)
})
