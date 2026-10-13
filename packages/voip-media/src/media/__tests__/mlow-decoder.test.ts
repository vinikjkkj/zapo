import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MLowCodec } from '../mlow-codec.js'
import {
    MLOW_MAX_SUBFRAMES,
    MlowPacketRead,
    mlowPacketSamples,
    writeMlowRed
} from '../mlow-packet.js'

import { OFFICIAL_MLOW_PACKETS, WEB_PT121_STREAM } from './_mlow-captures.js'
import {
    parsesAsMlow,
    pt121Corpus,
    type RedundantPacket,
    redundantPackets,
    voicedFrame
} from './_mlow-helpers.js'

test('MLowCodec drops duplicate and late packets', async () => {
    const codec = await MLowCodec.create()
    try {
        const packet = codec.encode(voicedFrame())

        let frames = 0
        const collect = (): void => {
            frames++
        }

        codec.decodeSequenced(10, packet, collect)
        codec.decodeSequenced(10, packet, collect)
        codec.decodeSequenced(9, packet, collect)

        assert.equal(frames, 1)
        assert.equal(codec.getStats().late, 2)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec does not re-emit frames when a rejected packet is followed by another', async () => {
    const codec = await MLowCodec.create()
    try {
        const first = codec.encode(voicedFrame())
        const rejected = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff])
        const fourth = codec.encode(voicedFrame(3 * 960))

        let frames = 0
        const collect = (): void => {
            frames++
        }

        codec.decodeSequenced(1, first, collect)
        codec.decodeSequenced(2, rejected, collect)
        codec.decodeSequenced(3, rejected, collect)
        codec.decodeSequenced(4, fourth, collect)

        assert.equal(codec.getStats().errors, 2, 'both malformed packets must reach the decoder')
        assert.equal(
            frames,
            4,
            'each sequence slot must produce exactly one frame, with none emitted twice'
        )
    } finally {
        codec.destroy()
    }
})

test('decodeSequenced says what became of the packet itself', async () => {
    const sender = await MLowCodec.create()
    const receiver = await MLowCodec.create()
    try {
        const packet = sender.encode(voicedFrame())
        const ignore = (): void => {}

        assert.equal(receiver.decodeSequenced(1, packet, ignore), 'decoded')
        assert.equal(receiver.decodeSequenced(1, packet, ignore), 'late')
        assert.equal(receiver.decodeSequenced(2, new Uint8Array(0), ignore), 'empty')
        assert.equal(
            receiver.decodeSequenced(2, Uint8Array.of(0xff, 0xff, 0xff, 0xff), ignore),
            'rejected'
        )
    } finally {
        sender.destroy()
        receiver.destroy()
    }
})

test('MLowCodec resets the sequence position without losing the decoder', async () => {
    const codec = await MLowCodec.create()
    try {
        const packet = codec.encode(voicedFrame())

        let frames = 0
        const collect = (): void => {
            frames++
        }

        codec.decodeSequenced(500, packet, collect)
        codec.resetSequence()
        codec.decodeSequenced(4, packet, collect)

        assert.equal(frames, 2)
        assert.equal(codec.getStats().late, 0)
        assert.equal(codec.getStats().plc, 0)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec hands decoded frames out of one reused buffer', async () => {
    const codec = await MLowCodec.create()
    try {
        const first = codec.encode(voicedFrame())
        const second = codec.encode(voicedFrame(960))

        const buffers: ArrayBufferLike[] = []
        const firstSamples: number[] = []
        codec.decodeSequenced(1, first, (pcm) => {
            buffers.push(pcm.buffer)
            firstSamples.push(...pcm.subarray(0, 8))
        })
        let overwritten = false
        codec.decodeSequenced(2, second, (pcm) => {
            buffers.push(pcm.buffer)
            assert.equal(pcm.length, 960)
            overwritten = firstSamples.some((sample, i) => sample !== pcm[i])
        })

        assert.equal(buffers.length, 2)
        assert.equal(buffers[0], buffers[1], 'each frame must land in the same scratch')
        assert.ok(overwritten, 'the second frame overwrites the first, so a consumer copies')
    } finally {
        codec.destroy()
    }
})

test('MLowCodec.decode still hands back a frame of its own', async () => {
    const codec = await MLowCodec.create()
    try {
        const a = codec.decode(codec.encode(voicedFrame()))
        const b = codec.decode(codec.encode(voicedFrame(960)))
        assert.notEqual(a.buffer, b.buffer)
        assert.equal(a.length, 960)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec plays the official stream through once, taking no sub-frame for a copy', async () => {
    const receiver = await MLowCodec.create()
    const reference = await MLowCodec.create()
    try {
        for (const { sequenceNumber, payload, timestamp } of OFFICIAL_MLOW_PACKETS) {
            const expected = reference.decode(payload)
            const played: Float32Array[] = []
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => played.push(pcm.slice()),
                timestamp
            )
            assert.deepEqual(played, [expected])
        }
        const stats = receiver.getStats()
        assert.equal(stats.success, OFFICIAL_MLOW_PACKETS.length)
        assert.equal(stats.errors, 0)
        assert.equal(stats.redundant, 0)
        assert.equal(stats.redRecovered, 0)
    } finally {
        receiver.destroy()
        reference.destroy()
    }
})

test('MLowCodec conceals a lost official packet at its length and takes no copy from the next', async () => {
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        OFFICIAL_MLOW_PACKETS.forEach(({ sequenceNumber, payload, timestamp }, index) => {
            if (index === 3) return
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => lengths.push(pcm.length),
                timestamp
            )
        })

        assert.deepEqual(lengths, Array(OFFICIAL_MLOW_PACKETS.length).fill(1920))
        const stats = receiver.getStats()
        assert.equal(stats.plc + stats.fec, 1)
        assert.equal(stats.redRecovered, 0)
        assert.equal(stats.redundant, 0)
    } finally {
        receiver.destroy()
    }
})

test('MLowCodec never plays a RED copy whose slot already played', async () => {
    const packets = await redundantPackets(5)
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        for (const { sequenceNumber, payload, timestamp } of packets) {
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => lengths.push(pcm.length),
                timestamp
            )
        }

        assert.deepEqual(lengths, [960, 960, 960, 960, 960], 'one 60 ms primary per packet')
        assert.equal(receiver.getStats().redundant, 4)
        assert.equal(receiver.getStats().redRecovered, 0)
    } finally {
        receiver.destroy()
    }
})

test('MLowCodec plays the copy in place of a lost packet, as the frame it stands for', async () => {
    const packets = await redundantPackets(5)
    const receiver = await MLowCodec.create()
    const reference = await MLowCodec.create()
    try {
        const played: number[] = []
        for (const index of [0, 1, 3, 4]) {
            const { sequenceNumber, payload, timestamp } = packets[index]
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => played.push(...pcm),
                timestamp
            )
        }

        const expected: number[] = []
        const lostCopy = packets[3].copy
        assert.ok(lostCopy)
        for (const frame of [
            packets[0].primary,
            packets[1].primary,
            lostCopy,
            packets[3].primary,
            packets[4].primary
        ]) {
            expected.push(...reference.decode(frame))
        }
        assert.deepEqual(played, expected, 'the copy fills the hole and nothing plays twice')
        const stats = receiver.getStats()
        assert.equal(stats.redRecovered, 1)
        assert.equal(stats.redundant, 2)
        assert.equal(stats.plc, 0)
        assert.equal(stats.fec, 0)
    } finally {
        receiver.destroy()
        reference.destroy()
    }
})

test('MLowCodec conceals only the hole the copy cannot cover after two losses', async () => {
    const packets = await redundantPackets(5)
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        for (const index of [0, 1, 4]) {
            const { sequenceNumber, payload, timestamp } = packets[index]
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => lengths.push(pcm.length),
                timestamp
            )
        }

        assert.deepEqual(lengths, [960, 960, 960, 1920])
        const stats = receiver.getStats()
        assert.equal(stats.plc + stats.fec, 1)
        assert.equal(stats.redRecovered, 1)
    } finally {
        receiver.destroy()
    }
})

test('MLowCodec plays both sub-frames of a plain multiframe on their own slots', async () => {
    const sender = await MLowCodec.create()
    const receiver = await MLowCodec.create()
    try {
        const frames = [0, 1, 2, 3, 4].map((index) => sender.encode(voicedFrame(index * 960)))
        const lengths: number[] = []
        const collect = (pcm: Float32Array): void => {
            lengths.push(pcm.length)
        }
        receiver.decodeSequenced(1, frames[0], collect, 0)
        receiver.decodeSequenced(2, sender.packFrames([frames[1], frames[2]]), collect, 960)
        receiver.decodeSequenced(3, sender.packFrames([frames[3], frames[4]]), collect, 2880)

        assert.deepEqual(lengths, [960, 1920, 1920], 'no audio of a plain stream is lost')
        assert.equal(receiver.getStats().redundant, 0)
    } finally {
        sender.destroy()
        receiver.destroy()
    }
})

test('MLowCodec decodes a plain 120 ms stream whole when it has its timestamps', async () => {
    const sender = await MLowCodec.create()
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        for (let packet = 0; packet < 4; packet++) {
            const a = sender.encode(voicedFrame(packet * 1920))
            const b = sender.encode(voicedFrame(packet * 1920 + 960))
            receiver.decodeSequenced(
                packet + 1,
                sender.packFrames([a, b]),
                (pcm) => lengths.push(pcm.length),
                packet * 1920
            )
        }

        assert.deepEqual(lengths, [1920, 1920, 1920, 1920])
        assert.equal(receiver.getStats().redundant, 0)
    } finally {
        sender.destroy()
        receiver.destroy()
    }
})

test('MLowCodec numbers a second stream apart and plays each slot of the two once', async () => {
    const { packets } = WEB_PT121_STREAM
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        const collect = (pcm: Float32Array): void => {
            lengths.push(pcm.length)
        }
        packets.forEach(({ sequenceNumber, payload, timestamp }, index) => {
            if (index !== 3) receiver.decodeSequenced(40_000 + index, payload, collect, timestamp)
            receiver.decodeSequenced(sequenceNumber, payload, collect, timestamp, 1)
        })

        assert.deepEqual(lengths, Array(packets.length).fill(960))
        const stats = receiver.getStats()
        assert.equal(stats.redundant, packets.length - 1)
        assert.equal(stats.late, 0)
        assert.equal(stats.plc + stats.fec, 0, 'the second stream filled the slot the first lost')
    } finally {
        receiver.destroy()
    }
})

test('MLowCodec reads in-band RED on PT 121 only, and a multiframe there stays plain MLow', async () => {
    const packets = await officialRedPackets(2)
    const receiver = await MLowCodec.create()
    try {
        for (const { sequenceNumber, payload, timestamp } of OFFICIAL_MLOW_PACKETS) {
            receiver.decodeSequenced(sequenceNumber, payload, () => {}, timestamp, 1)
        }
        assert.equal(receiver.getStats().redundant, 0, 'the 92 02 packets decode whole')
        assert.equal(receiver.getStats().errors, 0)

        receiver.resetSequence()
        const before = receiver.getStats().redundant
        for (const { sequenceNumber, payload, timestamp } of packets) {
            receiver.decodeSequenced(sequenceNumber, payload, () => {}, timestamp)
        }
        assert.equal(receiver.getStats().redundant, before, 'PT 120 never unwraps a RED copy')
    } finally {
        receiver.destroy()
    }
})

/** Official in-band RED: the copy of the frame before behind its header, then the frame, on its slot. */
async function officialRedPackets(count: number): Promise<RedundantPacket[]> {
    const sender = await MLowCodec.create({ red: true })
    try {
        const target = new Uint8Array(8_192)
        const packets: RedundantPacket[] = []
        let copy: Uint8Array | null = null
        for (let index = 0; index < count; index++) {
            const primary = sender.encode(voicedFrame(index * 960))
            const timestamp = index * 960
            const length = copy
                ? writeMlowRed(target, primary, timestamp, [copy], [timestamp - 960])
                : writeMlowRed(target, primary, timestamp, [], [])
            const payload = target.slice(0, length)
            packets.push({ sequenceNumber: index + 1, timestamp, payload, primary, copy })
            copy = sender.lastSecondary
        }
        return packets
    } finally {
        sender.destroy()
    }
}

test('MLowCodec drops every official RED copy whose slot already played', async () => {
    const packets = await officialRedPackets(5)
    const receiver = await MLowCodec.create()
    const reference = await MLowCodec.create()
    try {
        const played: number[] = []
        for (const { sequenceNumber, payload, timestamp } of packets) {
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => played.push(...pcm),
                timestamp,
                1
            )
        }

        const expected: number[] = []
        for (const { primary } of packets) expected.push(...reference.decode(primary))
        assert.deepEqual(played, expected, 'only the primaries play')
        const stats = receiver.getStats()
        assert.equal(stats.redundant, 4)
        assert.equal(stats.redRecovered, 0)
        assert.equal(stats.errors, 0)
    } finally {
        receiver.destroy()
        reference.destroy()
    }
})

test('MLowCodec plays an official RED copy in place of the packet that was lost', async () => {
    const packets = await officialRedPackets(5)
    const receiver = await MLowCodec.create()
    const reference = await MLowCodec.create()
    try {
        const played: number[] = []
        for (const index of [0, 1, 3, 4]) {
            const { sequenceNumber, payload, timestamp } = packets[index]
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => played.push(...pcm),
                timestamp,
                1
            )
        }

        const lostCopy = packets[3].copy
        assert.ok(lostCopy)
        const expected: number[] = []
        for (const frame of [
            packets[0].primary,
            packets[1].primary,
            lostCopy,
            packets[3].primary,
            packets[4].primary
        ]) {
            expected.push(...reference.decode(frame))
        }
        assert.deepEqual(played, expected, 'the copy fills the hole and nothing plays twice')
        const stats = receiver.getStats()
        assert.equal(stats.redRecovered, 1)
        assert.equal(stats.redundant, 2)
        assert.equal(stats.plc, 0)
        assert.equal(stats.fec, 0)
    } finally {
        receiver.destroy()
        reference.destroy()
    }
})

test('MLowCodec conceals only the hole an official RED copy cannot cover', async () => {
    const packets = await officialRedPackets(5)
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        for (const index of [0, 1, 4]) {
            const { sequenceNumber, payload, timestamp } = packets[index]
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => lengths.push(pcm.length),
                timestamp,
                1
            )
        }

        assert.deepEqual(lengths, [960, 960, 960, 960, 960])
        const stats = receiver.getStats()
        assert.equal(stats.plc, 1, 'the frame no copy covers is concealed')
        assert.equal(stats.fec, 0, 'the FEC of the primary is for the slot the copy fills')
        assert.equal(stats.redRecovered, 1)
    } finally {
        receiver.destroy()
    }
})

test('MLowCodec drops an in-band RED packet whose slot the other stream already played', async () => {
    const packets = await officialRedPackets(5)
    const receiver = await MLowCodec.create()
    const reference = await MLowCodec.create()
    try {
        const played: number[] = []
        const collect = (pcm: Float32Array): void => {
            played.push(...pcm)
        }
        for (const index of [0, 1, 2, 3]) {
            const { primary, timestamp } = packets[index]
            receiver.decodeSequenced(index + 1, primary, collect, timestamp)
        }
        for (const index of [1, 2]) {
            const { payload, timestamp } = packets[index]
            receiver.decodeSequenced(100 + index, payload, collect, timestamp, 1)
        }
        receiver.decodeSequenced(5, packets[4].primary, collect, packets[4].timestamp)

        const expected: number[] = []
        for (const { primary } of packets) expected.push(...reference.decode(primary))
        assert.deepEqual(played, expected, 'each slot plays once and the timeline never steps back')
        assert.equal(receiver.getStats().redundant, 4, 'copy and primary of both late packets')
    } finally {
        receiver.destroy()
        reference.destroy()
    }
})

test('MLowCodec decodes only the primary of an official RED packet without a timeline', async () => {
    const packets = await officialRedPackets(3)
    const receiver = await MLowCodec.create()
    const reference = await MLowCodec.create()
    try {
        const played: number[] = []
        for (const { sequenceNumber, payload } of packets) {
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => played.push(...pcm),
                undefined,
                1
            )
        }

        const expected: number[] = []
        for (const { primary } of packets) expected.push(...reference.decode(primary))
        assert.deepEqual(played, expected)
        assert.equal(receiver.getStats().errors, 0)
        assert.equal(receiver.getStats().redundant, 2)
    } finally {
        receiver.destroy()
        reference.destroy()
    }
})

interface TimelinePacket {
    readonly sequenceNumber: number
    readonly timestamp: number
    readonly payload: Uint8Array
    readonly span: number
}

type TimelinePacketKind = 'single' | 'single-copy' | 'pair' | 'pair-copy-first' | 'pair-copy-second'

/**
 * Packets one sender emits per `plan` entry: one 60 ms frame or a pair in a multiframe; a `-copy`
 * kind frames it as in-band RED behind the 60 ms copy of the previous packet's first or second frame.
 */
async function timelinePackets(plan: readonly TimelinePacketKind[]): Promise<TimelinePacket[]> {
    const sender = await MLowCodec.create({ red: true })
    try {
        const target = new Uint8Array(8_192)
        const packets: TimelinePacket[] = []
        let timestamp = 0
        let frame = 0
        let previous: { copies: Uint8Array[]; timestamp: number } | null = null
        for (let index = 0; index < plan.length; index++) {
            const kind = plan[index]
            const primaries: Uint8Array[] = []
            const copies: Uint8Array[] = []
            for (let count = kind.startsWith('single') ? 1 : 2; count > 0; count--) {
                primaries.push(sender.encode(voicedFrame(frame++ * 960)))
                copies.push(sender.lastSecondary!)
            }
            let payload = primaries.length === 1 ? primaries[0] : sender.packFrames(primaries)
            if (kind.includes('copy')) {
                const second = kind === 'pair-copy-second' && previous?.copies.length === 2
                const copy = previous ? previous.copies[second ? 1 : 0] : null
                const copyTimestamp = previous ? previous.timestamp + (second ? 960 : 0) : 0
                const length = copy
                    ? writeMlowRed(target, payload, timestamp, [copy], [copyTimestamp])
                    : writeMlowRed(target, payload, timestamp, [], [])
                payload = target.slice(0, length)
            }
            const span = primaries.length * 960
            packets.push({ sequenceNumber: index + 1, timestamp, payload, span })
            previous = { copies, timestamp }
            timestamp += span
        }
        return packets
    } finally {
        sender.destroy()
    }
}

/** Samples played for `packets` less `lost`, beside the clock span they cover. */
async function playedAgainstClock(
    packets: readonly TimelinePacket[],
    lost: readonly number[],
    stream: 0 | 1 = 0
): Promise<{ played: number; clock: number; stats: ReturnType<MLowCodec['getStats']> }> {
    const receiver = await MLowCodec.create()
    try {
        let played = 0
        for (let index = 0; index < packets.length; index++) {
            if (lost.includes(index)) continue
            const { sequenceNumber, payload, timestamp } = packets[index]
            receiver.decodeSequenced(
                sequenceNumber,
                payload,
                (pcm) => {
                    played += pcm.length
                },
                timestamp,
                stream
            )
        }
        const last = packets[packets.length - 1]
        const clock = last.timestamp + last.span - packets[0].timestamp
        return { played, clock, stats: receiver.getStats() }
    } finally {
        receiver.destroy()
    }
}

test('MLowCodec fills the hole of lost two-frame packets up to the next one', async () => {
    const plain = OFFICIAL_MLOW_PACKETS.map((packet, index) => ({
        ...packet,
        span: 1920,
        sequenceNumber: index + 1
    }))
    for (const lost of [[3], [3, 4]]) {
        const { played, clock, stats } = await playedAgainstClock(plain, lost)
        assert.equal(played, clock, `lost ${lost.join(',')}`)
        assert.equal(stats.fec, 1, 'the FEC of the next packet ends the hole')
    }

    const afterSingle = await timelinePackets(['pair', 'pair', 'single', 'pair', 'pair', 'pair'])
    for (const lost of [[3], [3, 4]]) {
        const { played, clock } = await playedAgainstClock(afterSingle, lost)
        assert.equal(played, clock, `a two-frame packet lost behind a single frame, lost ${lost}`)
    }
})

test('MLowCodec conceals the part of a lost two-frame packet an in-band RED copy leaves', async () => {
    for (const kind of ['pair-copy-first', 'pair-copy-second'] as const) {
        const packets = await timelinePackets(Array(8).fill(kind))
        for (const lost of [[3], [3, 4]]) {
            const { played, clock, stats } = await playedAgainstClock(packets, lost, 1)
            assert.equal(played, clock, `${kind}, lost ${lost.join(',')}`)
            assert.equal(stats.redRecovered, 1)
        }
    }
})

test('MLowCodec keeps single-frame streams on the clock across a loss', async () => {
    const plain = await timelinePackets(Array(8).fill('single'))
    const red = await timelinePackets(Array(8).fill('single-copy'))
    for (const lost of [[3], [3, 4]]) {
        const fromPlain = await playedAgainstClock(plain, lost)
        assert.equal(fromPlain.played, fromPlain.clock, `plain, lost ${lost.join(',')}`)
        const fromRed = await playedAgainstClock(red, lost, 1)
        assert.equal(fromRed.played, fromRed.clock, `in-band RED, lost ${lost.join(',')}`)
        assert.equal(fromRed.stats.redRecovered, 1)
    }
})

test('MLowCodec fills the hole of a lost pair that a single frame follows', async () => {
    const plain = await timelinePackets(['pair', 'pair', 'pair', 'pair', 'single', 'pair', 'pair'])
    const plainRun = await playedAgainstClock(plain, [3])
    assert.equal(plainRun.played, plainRun.clock, 'plain')

    const red = await timelinePackets([
        ...Array<TimelinePacketKind>(5).fill('pair-copy-first'),
        'single-copy',
        'pair-copy-first',
        'pair-copy-first'
    ])
    const redRun = await playedAgainstClock(red, [3, 4], 1)
    assert.equal(redRun.played, redRun.clock, 'in-band RED')
    assert.equal(redRun.stats.redRecovered, 1)
})

/** 1 s on the 16 kHz clock: a pause the sender took without losing a packet. */
const DTX_GAP = 16_000

test('MLowCodec leaves a timestamp jump without loss silent and conceals only what was lost', async () => {
    const packets = (await timelinePackets(Array(8).fill('pair'))).map((packet, index) =>
        index < 4 ? packet : { ...packet, timestamp: packet.timestamp + DTX_GAP }
    )

    const clean = await playedAgainstClock(packets, [])
    assert.equal(clean.played, clean.clock - DTX_GAP)
    assert.equal(clean.stats.plc + clean.stats.fec, 0, 'a pause is not a loss')

    const lostBefore = await playedAgainstClock(packets, [3])
    assert.equal(lostBefore.played, lostBefore.clock - DTX_GAP, 'the lost pair, not the pause')
})

test('MLowCodec takes the arriving packet FEC only for a gap that ends at that packet', async () => {
    const contiguous = await timelinePackets(Array(8).fill('pair'))
    const atPacket = await playedAgainstClock(contiguous, [3])
    assert.deepEqual([atPacket.stats.fec, atPacket.stats.plc], [1, 0])

    const paused = contiguous.map((packet, index) =>
        index < 4 ? packet : { ...packet, timestamp: packet.timestamp + DTX_GAP }
    )
    const beforePause = await playedAgainstClock(paused, [3])
    assert.deepEqual(
        [beforePause.stats.fec, beforePause.stats.plc],
        [0, 1],
        'the lost slot sits a pause before the packet its FEC belongs to'
    )
})

test('MLowCodec closes an in-band RED gap with the primary FEC only when it reaches the primary', async () => {
    const sender = await MLowCodec.create({ red: true })
    const receiver = await MLowCodec.create()
    try {
        const target = new Uint8Array(8_192)
        const payloads: Uint8Array[] = []
        let lostCopy: Uint8Array | null = null
        for (let index = 0; index < 5; index++) {
            const first = sender.encode(voicedFrame(index * 1920))
            if (index === 3) lostCopy = sender.lastSecondary
            const pair = sender.packFrames([first, sender.encode(voicedFrame(index * 1920 + 960))])
            const length =
                index === 4 && lostCopy
                    ? writeMlowRed(target, pair, index * 1920 + DTX_GAP, [lostCopy], [3 * 1920])
                    : writeMlowRed(target, pair, index * 1920, [], [])
            payloads.push(target.slice(0, length))
        }

        let played = 0
        for (const index of [0, 1, 2, 4]) {
            const timestamp = index * 1920 + (index === 4 ? DTX_GAP : 0)
            receiver.decodeSequenced(
                index + 1,
                payloads[index],
                (pcm) => {
                    played += pcm.length
                },
                timestamp,
                1
            )
        }

        const stats = receiver.getStats()
        assert.equal(stats.redRecovered, 1)
        assert.deepEqual([stats.fec, stats.plc], [0, 1], 'the gap stops a pause short of it')
        assert.equal(played, 5 * 1920, 'the lost pair is the copy and PLC, the pause stays silent')
    } finally {
        sender.destroy()
        receiver.destroy()
    }
})

test('MLowCodec rejects a packet over 120 ms, so no lost packet holds more', async () => {
    const sender = await MLowCodec.create()
    const receiver = await MLowCodec.create()
    try {
        const bounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
        for (let index = 0; index < 3; index++) {
            const frames = [0, 1, 2].map((frame) =>
                sender.encode(voicedFrame((index * 3 + frame) * 960))
            )
            const packet = sender.packFrames(frames)
            assert.equal(mlowPacketSamples(packet, bounds), 2880)
            receiver.decodeSequenced(index + 1, packet, () => {}, index * 2880)
        }
        assert.deepEqual([receiver.getStats().success, receiver.getStats().errors], [0, 3])
    } finally {
        sender.destroy()
        receiver.destroy()
    }
})

test('a PT 121 stream decodes the same through the shared read as through its own', async () => {
    const corpus = (await pt121Corpus()).slice(0, 60)
    const own = await MLowCodec.create()
    const shared = await MLowCodec.create()
    const read = new MlowPacketRead()
    try {
        const ownFrames: number[][] = []
        const sharedFrames: number[][] = []
        let timestamp = 1000
        corpus.forEach((payload, index) => {
            timestamp += 960
            if (index % 7 === 3) return
            const seq = 100 + index
            if (parsesAsMlow(payload)) {
                own.decodeSequenced(seq, payload, (pcm) => ownFrames.push([...pcm]), timestamp, 1)
            }
            if (read.read(payload)) {
                shared.decodeSequenced(
                    seq,
                    payload,
                    (pcm) => sharedFrames.push([...pcm]),
                    timestamp,
                    1,
                    read
                )
            }
        })

        assert.ok(ownFrames.length > 20)
        assert.deepEqual(sharedFrames, ownFrames)
        assert.deepEqual(shared.getStats(), own.getStats())
    } finally {
        own.destroy()
        shared.destroy()
    }
})
