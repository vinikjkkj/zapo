import assert from 'node:assert/strict'
import { test } from 'node:test'

import { readUInt32BE } from '../../bytes.js'
import type { InboundVideoFrame, InboundVideoRtpPacket } from '../../types.js'

import {
    A_VIDEO,
    B_VIDEO,
    createPlane,
    FULL_A,
    FULL_B,
    FULL_SSRCS,
    group,
    keys,
    material,
    NOBODY,
    SELF_VIDEO,
    SSRCS,
    videoKeyFrame
} from './_group-harness.js'

test('group video names its sender on the packets and on the frames', async (t) => {
    const packets: InboundVideoRtpPacket[] = []
    const frames: InboundVideoFrame[] = []
    const { plane, internals } = createPlane({
        onInboundVideoRtp: (packet) => packets.push(packet),
        onInboundVideo: (frame) => frames.push(frame)
    })
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: FULL_SSRCS, keys: keys(1), group: group(FULL_A, FULL_B) })

    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO))
    internals.onRelayData(videoKeyFrame(FULL_B, B_VIDEO))

    assert.deepEqual(
        packets.map((packet) => [packet.ssrc, packet.senderId]),
        [
            [A_VIDEO, 'a'],
            [B_VIDEO, 'b']
        ]
    )
    assert.deepEqual(
        frames.map((frame) => [frame.ssrc, frame.senderId, frame.keyFrame]),
        [
            [A_VIDEO, 'a', true],
            [B_VIDEO, 'b', true]
        ]
    )
})

test('a 1:1 call names no sender on its video', async (t) => {
    const packets: InboundVideoRtpPacket[] = []
    const { plane, internals } = createPlane({
        onInboundVideoRtp: (packet) => packets.push(packet)
    })
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })

    internals.onRelayData(videoKeyFrame({ ...FULL_A, recv: keys(1).recv }, A_VIDEO))

    assert.equal(packets.length, 1)
    assert.equal(packets[0].senderId, undefined)
})

/** Two senders through one reception restart it on every switch of SSRC. */
test('our video report and REMB carry each group sender apart', async (t) => {
    const { plane, relay, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({
        mediaType: 'video',
        ssrcs: FULL_SSRCS,
        keys: keys(1),
        group: group(FULL_A, FULL_B),
        accepted: true
    })
    const rtcp = internals as unknown as {
        srtcpContext: unknown
        rtcp: {
            receiverEstimateSchedule: unknown
            sendSenderReport: (
                srtcpContext: unknown,
                ssrc: number,
                packets: number,
                octets: number,
                timestamp: number,
                reception: unknown,
                video: boolean
            ) => void
        }
    }
    rtcp.srtcpContext = { protect: (packet: Uint8Array) => packet }
    rtcp.rtcp.receiverEstimateSchedule = { shouldReport: () => true }

    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO, 1))
    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO, 2))
    internals.onRelayData(videoKeyFrame(FULL_B, B_VIDEO, 1))
    rtcp.rtcp.sendSenderReport(rtcp.srtcpContext, SELF_VIDEO, 1, 10, 0, internals.group.audio, true)

    const rembs = relay.sent.filter((packet) => packet[1] === 206 && (packet[0] & 0x1f) === 15)
    const last = rembs.at(-1)!
    assert.equal(last[16], 2, 'two sources listed')
    assert.deepEqual([readUInt32BE(last, 20), readUInt32BE(last, 24)], [A_VIDEO, B_VIDEO])
    const report = relay.sent.filter((packet) => packet[1] === 200).at(-1)!
    assert.equal(report[0] & 0x0f, 2, 'a block per sender')
    assert.equal(report.length, 28 + 2 * 32 + 32, 'and no trailer')
    assert.deepEqual([readUInt32BE(report, 28), readUInt32BE(report, 60)], [A_VIDEO, B_VIDEO])
    assert.equal(readUInt32BE(report, 28 + 4) & 0xffffff, 0, 'the first sender lost nothing')
})

test('the plan sizes the video streams reassembled at once', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const senders = Array.from({ length: 12 }, (_, index) => {
        const base = 0x1000 * (index + 1)
        return {
            id: `s${index}`,
            audio: base,
            streams: [base, base + 3],
            recv: material(index + 10)
        }
    })
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: { senders } })

    for (const sender of senders) {
        internals.onRelayData(videoKeyFrame(sender, sender.audio + 3))
    }

    assert.equal(internals.inboundVideo.maxStreams, 24)
    assert.equal(internals.inboundVideo.streams.size, 12, 'more than the 1:1 bound of 8')
    await plane.apply({ group: null })
    assert.equal(internals.inboundVideo.maxStreams, 8)
    assert.equal(internals.inboundVideo.streams.size, 0, 'the group streams leave with the plan')
})

/** Reassembly is evicted oldest first, so a departed sender's stream must not outlive the plan. */
test('a sender that leaves the plan takes its video streams, and the active ones keep theirs', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    const senders = Array.from({ length: 5 }, (_, index) => {
        const base = 0x1000 * (index + 1)
        return {
            id: `s${index}`,
            audio: base,
            streams: [base, base + 3, base + 4],
            recv: material(index + 10)
        }
    })
    await plane.apply({ ssrcs: SSRCS, keys: keys(1), group: { senders } })
    for (const sender of senders) {
        internals.onRelayData(videoKeyFrame(sender, sender.audio + 3))
        internals.onRelayData(videoKeyFrame(sender, sender.audio + 4))
    }
    assert.equal(internals.inboundVideo.streams.size, 10)

    const staying = senders.filter((_, index) => index !== 2)
    await plane.apply({ group: { senders: staying } })

    assert.equal(internals.inboundVideo.maxStreams, 8)
    assert.deepEqual(
        [...internals.inboundVideo.streams.keys()],
        staying.flatMap((sender) => [sender.audio + 3, sender.audio + 4]),
        'the departed sender lost its streams, not the oldest active one'
    )
})

test('leaving group mode drops the group video streams and keeps the 1:1 ones', async (t) => {
    const { plane, internals } = createPlane()
    t.after(() => plane.stop())
    await plane.apply({ ssrcs: SSRCS, keys: keys(1) })
    internals.onRelayData(videoKeyFrame({ ...FULL_A, recv: keys(1).recv }, NOBODY))
    await plane.apply({ ssrcs: FULL_SSRCS, group: group(FULL_A) })
    internals.onRelayData(videoKeyFrame(FULL_A, A_VIDEO))
    assert.equal(internals.inboundVideo.streams.size, 2)

    await plane.apply({ group: null })

    assert.deepEqual([...internals.inboundVideo.streams.keys()], [NOBODY])
})
