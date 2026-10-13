import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readUInt32BE } from '../../bytes.js'
import { MLowCodec } from '../../media/mlow-codec.js'
import { writeMlowRed } from '../../media/mlow-packet.js'
import { RtpPacket } from '../../media/rtp.js'

import {
    A_AUDIO,
    A_FEC,
    B_AUDIO,
    concat,
    createDecodingPlane,
    createPlane,
    encodeFrames,
    FRAME,
    framed,
    group,
    keys,
    MLOW_RED_PAYLOAD_TYPE,
    PAYLOAD,
    plainRtp,
    playedSamples,
    protectedRtp,
    SENDER_A,
    SENDER_B,
    SSRCS
} from './_group-harness.js'

test('every stream of a sender feeds its decoder, PT 121 numbered apart', async (t) => {
    const { plane, internals, decoders } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1, MLOW_RED_PAYLOAD_TYPE))
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_FEC, 9))

    assert.deepEqual(decoders[0].seqs, [1, 9])
    assert.deepEqual(decoders[0].streams, [1, 0])
})

test('the playout mixes the senders and each sender is heard on its own', async (t) => {
    const heard: string[] = []
    const { plane, relay, internals } = createPlane({
        onSenderAudio: (senderId) => heard.push(senderId)
    })
    t.after(() => plane.stop())
    relay.connected = true
    await plane.apply({
        ssrcs: SSRCS,
        keys: keys(1),
        group: group(SENDER_A, SENDER_B),
        accepted: true
    })

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 1))
    const out = new Float32Array(FRAME)

    assert.equal(plane.pullPlayout(out), FRAME)
    assert.ok(Math.abs(out[0] - 0.2) < 1e-6, 'two senders at 0.1 each')
    assert.deepEqual(heard, ['a', 'b'])
    assert.equal(plane.getStats().playout.buffered, 0)
})

/**
 * Group audio arrives on PT 121 as in-band RED, the same container as a 1:1 call: each
 * sender's decoder plays the copy a loss left a hole for, so its played time matches the
 * RTP clock, and the mix is the two senders summed.
 */
test('two senders on in-band RED each recover their own loss and mix into one playout', async (t) => {
    const { plane, internals, perSender } = await createDecodingPlane(t, [SENDER_A, SENDER_B])

    const packets = 8
    const streams = [
        { id: 'a', ssrc: A_AUDIO, tone: 440, lost: 3, firstSeq: 100, firstTs: 48_000 },
        { id: 'b', ssrc: B_AUDIO, tone: 660, lost: 5, firstSeq: 7, firstTs: 1_920 }
    ]
    const encoded: Uint8Array[][] = []
    for (const stream of streams) {
        const encoder = await MLowCodec.create({ red: true })
        t.after(() => encoder.destroy())
        const target = new Uint8Array(8_192)
        const wire: Uint8Array[] = []
        let copy: Uint8Array | null = null
        for (let index = 0; index < packets; index++) {
            const frame = new Float32Array(FRAME).map(
                (_, sample) =>
                    Math.sin((2 * Math.PI * stream.tone * (index * FRAME + sample)) / 16_000) * 0.2
            )
            const timestamp = stream.firstTs + index * FRAME
            const primary = encoder.encode(frame)
            const length = copy
                ? writeMlowRed(target, primary, timestamp, [copy], [timestamp - FRAME])
                : writeMlowRed(target, primary, timestamp, [], [])
            wire.push(
                plainRtp(stream.ssrc, stream.firstSeq + index, timestamp, target.slice(0, length))
            )
            copy = encoder.lastSecondary
        }
        encoded.push(wire)
    }

    for (let index = 0; index < packets; index++) {
        streams.forEach((stream, which) => {
            if (index !== stream.lost) internals.onRelayData(encoded[which][index])
        })
    }

    for (const stream of streams) {
        const played = perSender[stream.id].reduce((sum, pcm) => sum + pcm.length, 0)
        assert.equal(played, packets * FRAME, `sender ${stream.id} plays its whole timeline`)
    }
    const rows = plane.getStats().senders ?? []
    assert.deepEqual(
        rows.map((row) => [row.id, row.plc, row.late, row.decodeErrors]),
        [
            ['a', 0, 0, 0],
            ['b', 0, 0, 0]
        ],
        'the copies filled the holes, nothing concealed'
    )

    const out = new Float32Array(packets * FRAME)
    assert.equal(plane.pullPlayout(out), packets * FRAME)
    const a = concat(perSender.a)
    const b = concat(perSender.b)
    let worst = 0
    for (let i = 0; i < out.length; i++) {
        const expected = Math.max(-1, Math.min(1, a[i] + b[i]))
        worst = Math.max(worst, Math.abs(out[i] - expected))
    }
    assert.ok(worst < 1e-6, `the mix is the sum of the senders, off by ${worst}`)
})

test('one audio REMB stream is followed, the first sender heard until it leaves', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const named: number[] = []
    internals.sendAudioReceiverEstimate = (ssrc) => named.push(ssrc)
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A, SENDER_B) })

    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 1))
    internals.onRelayData(protectedRtp(SENDER_A.recv, A_AUDIO, 2))
    await plane.apply({ group: group(SENDER_B) })
    internals.onRelayData(protectedRtp(SENDER_B.recv, B_AUDIO, 2))

    assert.deepEqual(named, [A_AUDIO, A_AUDIO, B_AUDIO])
})

/** RC above one drops the packet trailer, which only a single block carries. */
test('our audio sender report carries a block per sender heard', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    relay.connected = true
    await plane.apply({
        ssrcs: SSRCS,
        keys: keys(1),
        group: group(SENDER_A, SENDER_B),
        accepted: true
    })
    const passThrough = internals as unknown as {
        srtpSession: unknown
        srtcpContext: unknown
        rtcp: { audioReportSchedule: unknown }
        sendAudioPacket: (frame: Uint8Array, ts: number, marker: boolean, captureMs: number) => void
    }
    passThrough.srtpSession = {
        protect: (packet: RtpPacket) => packet.encode(),
        unprotect: (data: Uint8Array) => RtpPacket.decode(data)
    }
    passThrough.srtcpContext = { protect: (rtcp: Uint8Array) => rtcp }
    passThrough.rtcp.audioReportSchedule = { shouldReport: () => true }
    const reports = (): Uint8Array[] => relay.sent.filter((packet) => packet[1] === 200)

    internals.onRelayData(plainRtp(A_AUDIO, 1, FRAME, PAYLOAD))
    passThrough.sendAudioPacket(PAYLOAD, FRAME, false, 0)
    internals.onRelayData(plainRtp(B_AUDIO, 1, FRAME, PAYLOAD))
    passThrough.sendAudioPacket(PAYLOAD, 2 * FRAME, false, 0)

    const [one, two] = reports()
    assert.equal(one[0] & 0x1f, 1)
    assert.equal(one.length, 28 + 32 + 16 + 32, 'one block keeps the trailer')
    assert.equal(two[0] & 0x1f, 2)
    assert.equal(two.length, 28 + 2 * 32 + 32, 'two blocks and no trailer')
    assert.deepEqual([readUInt32BE(two, 28), readUInt32BE(two, 60)], [A_AUDIO, B_AUDIO])
})

test('the stats carry the senders on a group call only', async (t) => {
    const oneToOne = createPlane()
    t.after(() => oneToOne.plane.stop())
    await oneToOne.plane.apply({ ssrcs: SSRCS, keys: keys(1) })
    const groupCall = createPlane()
    t.after(() => groupCall.plane.stop())
    await groupCall.plane.apply({ ssrcs: SSRCS, keys: keys(1), group: group(SENDER_A) })

    assert.equal(oneToOne.plane.getStats().senders, undefined)
    assert.deepEqual(groupCall.plane.getStats().senders, [
        {
            id: 'a',
            recv: 0,
            decoded: 0,
            decodeErrors: 0,
            late: 0,
            plc: 0,
            lossPercent: 0,
            authFailures: 0,
            decoderPending: 0,
            pt122Received: 0,
            pt122Decoded: 0,
            pt122Rejected: 0
        }
    ])
})

/** The sender's numbering runs on from PT 120 into PT 122, which the relay leaves unframed. */
test('PT 122 continues a sender PT 120 stream on its decoder with no gap', async (t) => {
    const { plane, internals, perSender } = await createDecodingPlane(t, [SENDER_A])
    const frames = await encodeFrames(t, 8)

    frames.forEach((frame, index) => {
        const seq = 1085 + index
        const timestamp = 96_000 + index * FRAME
        internals.onRelayData(
            index < 4
                ? framed(plainRtp(A_AUDIO, seq, timestamp, frame, 120), 0x02)
                : plainRtp(A_AUDIO, seq, timestamp, frame, 122)
        )
    })

    assert.equal(playedSamples(perSender.a), 8 * FRAME)
    const [row] = plane.getStats().senders ?? []
    assert.deepEqual(
        [row.plc, row.late, row.decodeErrors, row.decoded],
        [0, 0, 0, 8],
        'one timeline across the switch'
    )
    assert.deepEqual([row.pt122Received, row.pt122Decoded, row.pt122Rejected], [4, 4, 0])
})

test('a PT 122 payload the decoder rejects is counted, plays nothing, and the stream goes on', async (t) => {
    const { plane, internals, perSender } = await createDecodingPlane(t, [SENDER_A])
    const frames = await encodeFrames(t, 6)
    const invalid = Uint8Array.of(0xff, 0xff, 0xff, 0xff)

    frames.forEach((frame, index) => {
        const payloadType = index < 3 ? 120 : 122
        internals.onRelayData(
            plainRtp(A_AUDIO, index + 1, index * FRAME, index === 3 ? invalid : frame, payloadType)
        )
    })

    assert.equal(
        playedSamples(perSender.a),
        6 * FRAME,
        'the rejected slot is concealed in place, never decoded from the payload'
    )
    const [row] = plane.getStats().senders ?? []
    assert.deepEqual([row.pt122Received, row.pt122Decoded, row.pt122Rejected], [3, 2, 1])
    assert.equal(row.late, 0)
    assert.equal(row.decodeErrors, 1)
})

test('a 1:1 call decodes PT 122 on the peer stream PT 120 numbers', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    const streams: number[] = []
    ;(internals.codec as { decodeSequenced: unknown }).decodeSequenced = (
        _seq: number,
        _packet: Uint8Array,
        _onFrame: unknown,
        _timestamp: number,
        stream: number
    ) => {
        streams.push(stream)
        return 'decoded'
    }
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(protectedRtp(keys(1).recv, B_AUDIO, 1, 122))

    assert.deepEqual(streams, [0])
    assert.equal(relay.subscriptions.at(-1), B_AUDIO)
    assert.equal(plane.getStats().audioReceived, 1)
})
