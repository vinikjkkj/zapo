import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from '../../logger.js'
import {
    MLOW_ENCODER_CTL,
    MLOW_MAX_RED_BLOCKS,
    MLOW_MAX_SUBFRAMES,
    MLowCodec,
    mlowFrameSamples,
    mlowPacketSamples,
    readMlowRed,
    readMlowSubframes,
    writeMlowRed
} from '../mlow-codec.js'

import { ANDROID_PT121_STREAM, OFFICIAL_MLOW_PACKETS, WEB_PT121_STREAM } from './_mlow-captures.js'

function voicedFrame(offset = 0): Float32Array {
    const frame = new Float32Array(960)
    for (let i = 0; i < frame.length; i++) {
        frame[i] = Math.sin((2 * Math.PI * 440 * (i + offset)) / 16_000) * 0.25
    }
    return frame
}

function captureWarnings(): { logger: Logger; warnings: string[] } {
    const warnings: string[] = []
    const logger: Logger = {
        ...createNoopLogger(),
        warn: (message: string) => {
            warnings.push(message)
        },
        child: () => logger
    }
    return { logger, warnings }
}

test('MLowCodec initializes at 16 kHz with a 960-sample frame size', async () => {
    const codec = await MLowCodec.create()
    try {
        assert.equal(codec.getFrameSize(), 960)
        assert.equal(codec.getSampleRate(), 16_000)
        assert.equal(codec.getFrameDurationMs(), 60)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec round-trips a voiced 960-sample frame with useSmpl', async () => {
    const codec = await MLowCodec.create()
    try {
        const packet = codec.encode(voicedFrame())
        assert.ok(packet.length > 0)

        const decoded = codec.decode(packet)
        assert.equal(decoded.length, 960)

        const stats = codec.getStats()
        assert.equal(stats.success, 1)
        assert.equal(stats.errors, 0)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec PLC returns a full frame on null input', async () => {
    const codec = await MLowCodec.create()
    try {
        const plc = codec.decode(null)
        assert.equal(plc.length, codec.getFrameSize())
        assert.equal(codec.getStats().plc, 1)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec rejects an encode frame that is not exactly one frame long', async () => {
    const codec = await MLowCodec.create()
    try {
        assert.throws(() => codec.encode(new Float32Array(480)), /960 samples/)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec conceals a single-packet gap through in-band FEC', async () => {
    const codec = await MLowCodec.create({ packetLossPercent: 20 })
    try {
        const first = codec.encode(voicedFrame())
        const second = codec.encode(voicedFrame(960))

        const frames: number[] = []
        const collect = (pcm: Float32Array): void => {
            frames.push(pcm.length)
        }

        codec.decodeSequenced(100, first, collect)
        codec.decodeSequenced(102, second, collect)

        assert.equal(frames.length, 3)
        const stats = codec.getStats()
        assert.equal(stats.fec, 1)
        assert.equal(stats.plc, 0, 'FEC has to be tried before concealment')
        assert.equal(stats.success, 2)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec conceals every packet of a short gap, FEC last', async () => {
    const codec = await MLowCodec.create({ packetLossPercent: 20 })
    try {
        const first = codec.encode(voicedFrame())
        const second = codec.encode(voicedFrame(960))

        let frames = 0
        const collect = (): void => {
            frames++
        }

        codec.decodeSequenced(1, first, collect)
        codec.decodeSequenced(5, second, collect)

        assert.equal(frames, 5)
        const stats = codec.getStats()
        assert.equal(stats.plc, 2)
        assert.equal(stats.fec, 1)
        assert.equal(stats.concealCapped, 0)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec caps concealment on a long outage instead of synthesising forever', async () => {
    const codec = await MLowCodec.create({ maxConcealFrames: 3 })
    try {
        const first = codec.encode(voicedFrame())
        const second = codec.encode(voicedFrame(960))

        let frames = 0
        const collect = (): void => {
            frames++
        }

        codec.decodeSequenced(1, first, collect)
        codec.decodeSequenced(400, second, collect)

        assert.equal(codec.getMaxConcealFrames(), 3)
        assert.equal(frames, 5)
        const stats = codec.getStats()
        assert.equal(stats.plc, 2)
        assert.equal(stats.fec, 1)
        assert.equal(stats.concealCapped, 1)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec can disable concealment entirely', async () => {
    const codec = await MLowCodec.create({ maxConcealFrames: 0 })
    try {
        const packet = codec.encode(voicedFrame())

        let frames = 0
        const collect = (): void => {
            frames++
        }

        codec.decodeSequenced(1, packet, collect)
        codec.decodeSequenced(9, packet, collect)

        assert.equal(frames, 2)
        const stats = codec.getStats()
        assert.equal(stats.plc, 0)
        assert.equal(stats.fec, 0)
        assert.equal(stats.concealCapped, 1)
    } finally {
        codec.destroy()
    }
})

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

test('MLowCodec does not conceal across a sequence number wrap', async () => {
    const codec = await MLowCodec.create()
    try {
        const packet = codec.encode(voicedFrame())

        let frames = 0
        const collect = (): void => {
            frames++
        }

        codec.decodeSequenced(65_535, packet, collect)
        codec.decodeSequenced(0, packet, collect)

        assert.equal(frames, 2)
        const stats = codec.getStats()
        assert.equal(stats.plc, 0)
        assert.equal(stats.fec, 0)
        assert.equal(stats.late, 0)
    } finally {
        codec.destroy()
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

test('MLowCodec clamps the expected packet loss percentage', async () => {
    const codec = await MLowCodec.create()
    try {
        assert.equal(codec.getExpectedPacketLossPercent(), 0)

        codec.setExpectedPacketLossPercent(140)
        assert.equal(codec.getExpectedPacketLossPercent(), 100)

        codec.setExpectedPacketLossPercent(-5)
        assert.equal(codec.getExpectedPacketLossPercent(), 0)

        codec.setExpectedPacketLossPercent(Number.NaN)
        assert.equal(codec.getExpectedPacketLossPercent(), 0)

        codec.setExpectedPacketLossPercent(12.4)
        assert.equal(codec.getExpectedPacketLossPercent(), 12)

        assert.ok(codec.encode(voicedFrame()).length > 0)
    } finally {
        codec.destroy()
    }
})

test('MLOW_ENCODER_CTL pins the MLow encoder control request ids', () => {
    assert.equal(MLOW_ENCODER_CTL.SUBFRAME_IMPORTANCE, 4060)
    assert.equal(MLOW_ENCODER_CTL.USE_SPEECH_ACTIVITY_FLATNESS, 4062)
    assert.equal(MLOW_ENCODER_CTL.VAD_NON_BINARY, 4066)
    assert.equal(MLOW_ENCODER_CTL.VAD_HIGHPASS_SHARPNESS, 4068)
})

test('MLowCodec writes the MLow encoder tunables it is given', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({
        logger,
        tunables: {
            useSpeechActivityFlatness: 0,
            vadNonBinary: 0
        }
    })
    try {
        assert.deepEqual(warnings, [])
        assert.ok(codec.encode(voicedFrame()).length > 0)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec reports a rejected encoder tunable instead of throwing', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({ logger })
    try {
        codec.applyEncoderTunables({ subframeImportance: Number.MAX_SAFE_INTEGER })
        assert.deepEqual(warnings, ['mlow encoder ctl rejected'])
        assert.ok(codec.encode(voicedFrame()).length > 0)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec leaves tunables unset when none are given', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({ logger })
    try {
        codec.applyEncoderTunables({})
        assert.deepEqual(warnings, [])
    } finally {
        codec.destroy()
    }
})

function silentFrame(): Float32Array {
    return new Float32Array(960)
}

interface ReferenceRepacketizer {
    pack(frames: readonly Uint8Array[]): Uint8Array
    free(): void
}

/** The fork's own repacketizer, the reference the codec's packets are held against. */
async function referenceRepacketizer(): Promise<ReferenceRepacketizer> {
    const lib = (await import('libmlow-wasm-fork')) as unknown as {
        createRepacketizer(): Promise<ReferenceRepacketizer>
    }
    return lib.createRepacketizer()
}

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

test('MLowCodec.encodeInto writes the bytes encode produces, into the caller buffer', async () => {
    const left = await MLowCodec.create()
    const right = await MLowCodec.create()
    try {
        const target = new Uint8Array(4000)
        for (let frame = 0; frame < 3; frame++) {
            const expected = left.encode(voicedFrame(frame * 960))
            const length = right.encodeInto(voicedFrame(frame * 960), target)
            assert.deepEqual(target.subarray(0, length), expected)
        }
    } finally {
        left.destroy()
        right.destroy()
    }
})

test('MLowCodec packs two 60 ms frames in the multiframe the repacketizer writes', async () => {
    const codec = await MLowCodec.create()
    const reference = await referenceRepacketizer()
    try {
        const first = codec.encode(voicedFrame())
        const second = codec.encode(voicedFrame(960))

        const packet = codec.packFrames([first, second])

        assert.deepEqual(packet, reference.pack([first, second]))
        assert.equal(first[0] & 0xf9, 0x50, 'a voiced 60 ms wideband frame opens on 0x50')
        assert.equal(packet[0], 0x82 | (first[0] & 0x39), 'the marker carries the inner TOC')
        assert.equal(packet[0], 0x92)
        assert.equal(packet[1] & 0x3f, 2, 'two sub-frames')
        assert.equal(packet[2], first.length, 'the length of the first sub-frame')
        assert.equal(packet[3], first[0], 'the first sub-frame starts on its own TOC')
        assert.deepEqual(packet.subarray(3, 3 + first.length), first)
        assert.deepEqual(packet.subarray(3 + first.length), second)
    } finally {
        reference.free()
        codec.destroy()
    }
})

test('MLowCodec decodes a 120 ms packet whole and recovers a lost one at its length', async () => {
    const sender = await MLowCodec.create({ packetLossPercent: 20 })
    const receiver = await MLowCodec.create()
    try {
        const packets: Uint8Array[] = []
        for (let packet = 0; packet < 3; packet++) {
            const a = sender.encode(voicedFrame(packet * 1920))
            const b = sender.encode(voicedFrame(packet * 1920 + 960))
            packets.push(sender.packFrames([a, b]))
        }

        const lengths: number[] = []
        const collect = (pcm: Float32Array): void => {
            lengths.push(pcm.length)
        }
        receiver.decodeSequenced(10, packets[0], collect)
        receiver.decodeSequenced(12, packets[2], collect)

        assert.deepEqual(lengths, [1920, 1920, 1920])
        assert.equal(receiver.getStats().fec, 1)
        assert.equal(receiver.getStats().plc, 0)
    } finally {
        sender.destroy()
        receiver.destroy()
    }
})

test('MLowCodec with RED turns DTX off and yields a redundant copy of every frame', async () => {
    const codec = await MLowCodec.create({ red: true })
    try {
        assert.equal(codec.redActive, true)
        const target = new Uint8Array(4000)
        for (let frame = 0; frame < 12; frame++) {
            const length = codec.encodeInto(silentFrame(), target)
            assert.ok(length > 1, 'with DTX off a silent frame is still coded')
            const secondary = codec.lastSecondary
            assert.ok(secondary && secondary.length > 0)
            assert.equal(secondary[0] & 0x39, target[0] & 0x39, 'same rate, duration and channels')
        }
    } finally {
        codec.destroy()
    }
})

test('MLowCodec without RED keeps DTX and yields no redundant copy', async () => {
    const codec = await MLowCodec.create()
    try {
        assert.equal(codec.redActive, false)
        const target = new Uint8Array(4000)
        let shortest = Number.MAX_SAFE_INTEGER
        for (let frame = 0; frame < 12; frame++) {
            shortest = Math.min(shortest, codec.encodeInto(silentFrame(), target))
            assert.equal(codec.lastSecondary, null)
        }
        assert.ok(shortest <= 2, 'a long silence settles on DTX frames')
    } finally {
        codec.destroy()
    }
})

test('the official packets split into two 60 ms sub-frames that fill the timestamp step', () => {
    const bounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    for (let index = 0; index < OFFICIAL_MLOW_PACKETS.length; index++) {
        const { payload, timestamp, sequenceNumber } = OFFICIAL_MLOW_PACKETS[index]
        assert.equal(readMlowSubframes(payload, bounds), 2)
        assert.equal(payload[0], 0x92)
        assert.equal(payload[1], 0x02)
        assert.deepEqual([bounds[0], bounds[1]], [3, payload[2]])
        assert.equal(bounds[2], 3 + payload[2])
        assert.equal(bounds[2] + bounds[3], payload.length)
        assert.equal(payload[bounds[0]], 0x50)
        assert.equal(payload[bounds[2]], 0x50)

        const span = mlowFrameSamples(payload[bounds[0]]) + mlowFrameSamples(payload[bounds[2]])
        assert.equal(span, 1920)
        const next = OFFICIAL_MLOW_PACKETS[index + 1]
        if (next) {
            assert.equal(next.sequenceNumber - sequenceNumber, 1)
            assert.equal(next.timestamp - timestamp, span, 'no sub-frame repeats an earlier slot')
        }
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

interface RedundantPacket {
    readonly sequenceNumber: number
    readonly timestamp: number
    readonly payload: Uint8Array
    readonly primary: Uint8Array
    readonly copy: Uint8Array | null
}

/** RED as the plane sends it: the copy of the frame before, then the frame, at the copy's slot. */
async function redundantPackets(count: number): Promise<RedundantPacket[]> {
    const sender = await MLowCodec.create({ red: true })
    try {
        const packets: RedundantPacket[] = []
        let copy: Uint8Array | null = null
        for (let index = 0; index < count; index++) {
            const primary = sender.encode(voicedFrame(index * 960))
            packets.push({
                sequenceNumber: index + 1,
                timestamp: copy ? (index - 1) * 960 : 0,
                payload: copy ? sender.packFrames([copy, primary]) : primary,
                primary,
                copy
            })
            copy = sender.lastSecondary
        }
        return packets
    } finally {
        sender.destroy()
    }
}

test('RED packets keep the official framing, the copy first on the slot of the frame before', async () => {
    const packets = await redundantPackets(3)
    const official = OFFICIAL_MLOW_PACKETS[0].payload
    const bounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    for (const { payload, primary, copy } of packets.slice(1)) {
        assert.ok(copy)
        assert.equal(readMlowSubframes(payload, bounds), 2)
        assert.equal(payload[0], official[0])
        assert.equal(payload[1], official[1])
        assert.equal(payload[2], copy.length)
        assert.deepEqual(payload.subarray(bounds[0], bounds[0] + bounds[1]), copy)
        assert.deepEqual(payload.subarray(bounds[2]), primary)
        assert.equal(payload[bounds[0]] & 0x39, official[3] & 0x39, 'same rate, duration, channels')
        assert.equal(mlowFrameSamples(payload[bounds[0]]), 960)
        assert.equal(mlowFrameSamples(payload[bounds[2]]), 960)
    }
    assert.deepEqual(
        packets.map((packet) => packet.timestamp),
        [0, 0, 960],
        'stamped on the copy, so the primary of frame n lands on n * 960'
    )
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

test('mlowPacketSamples spans a frame or a multiframe, and is 0 for what is not MLow', () => {
    const bounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    for (const { payload } of [...ANDROID_PT121_STREAM.packets, ...WEB_PT121_STREAM.packets]) {
        assert.equal(mlowPacketSamples(payload, bounds), payload.length === 1 ? 160 : 960)
    }
    assert.equal(mlowPacketSamples(OFFICIAL_MLOW_PACKETS[0].payload, bounds), 1920)
    assert.equal(mlowPacketSamples(new Uint8Array(0), bounds), 0)
    assert.equal(mlowPacketSamples(Uint8Array.of(0xfc, 0xff, 0xfe), bounds), 0, 'a CELT TOC')
    assert.equal(mlowPacketSamples(Uint8Array.of(0x92, 0x02, 0xff, 0x50), bounds), 0)
    assert.equal(mlowPacketSamples(Uint8Array.of(0x92, 0x02, 0x01, 0x50, 0xc0), bounds), 0)
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

test('MLowCodec decodes without the Companion when its model does not load', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({ logger, companionModel: new Uint8Array([1, 2, 3, 4]) })
    try {
        assert.equal(codec.companionActive, false)
        assert.deepEqual(warnings, ['mlow companion unavailable, decoding without it'])
        assert.equal(codec.decode(codec.encode(voicedFrame())).length, 960)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec degrades the same way when the Companion loader fails', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({
        logger,
        companionModel: () => Promise.reject(new Error('weights missing'))
    })
    try {
        assert.equal(codec.companionActive, false)
        assert.deepEqual(warnings, ['mlow companion unavailable, decoding without it'])
    } finally {
        codec.destroy()
    }
})

test('MLowCodec resets the Companion where the inbound sequence restarts', async () => {
    const codec = await MLowCodec.create()
    try {
        let resets = 0
        const decoder = (codec as unknown as { decoder: object }).decoder
        Object.defineProperty(decoder, 'hasCompanion', { value: true })
        Object.defineProperty(decoder, 'resetCompanion', { value: () => resets++ })

        codec.resetSequence()

        assert.equal(resets, 1)
    } finally {
        codec.destroy()
    }
})

/** `[offset, length, Δts]` per copy, then the primary's `[offset, length]`. */
const RED_BOUNDS_LENGTH = (MLOW_MAX_RED_BLOCKS + 1) * 3

test('writeMlowRed puts every copy header, the 0x00 primary header, the copies, then the primary', () => {
    const target = new Uint8Array(64)
    const primary = Uint8Array.from([0x50, 1, 2, 3])
    const older = Uint8Array.from([0x48, 9, 9])
    const newer = Uint8Array.from([0x48, 7])

    const length = writeMlowRed(target, primary, 1920, [older, newer], [1280, 1600])

    assert.deepEqual(
        target.subarray(0, length),
        Uint8Array.from([0x84, 3, 0x82, 2, 0x00, 0x48, 9, 9, 0x48, 7, 0x50, 1, 2, 3]),
        'F=1 headers 40 and 20 ms back in 10 ms units, the F=0 primary header, then the bodies'
    )
})

test('writeMlowRed frames a 33-byte copy of the 60 ms before as 86 21, then the 0x00', () => {
    const target = new Uint8Array(128)
    const copy = new Uint8Array(33).fill(0x54)
    const primary = Uint8Array.from([0x50, 5])

    const length = writeMlowRed(target, primary, 1920, [copy], [960])

    assert.deepEqual(target.subarray(0, 3), Uint8Array.from([0x86, 0x21, 0x00]))
    assert.deepEqual(target.subarray(3, 36), copy)
    assert.deepEqual(target.subarray(36, length), primary)
})

test('writeMlowRed stamps a copy 60 ms back as 0x86 across a timestamp wrap', () => {
    const target = new Uint8Array(16)
    const copy = Uint8Array.from([0x50])
    const length = writeMlowRed(target, Uint8Array.from([0x50, 5]), 200, [copy], [0xffff_fd08])
    assert.deepEqual(target.subarray(0, length), Uint8Array.from([0x86, 1, 0x00, 0x50, 0x50, 5]))
})

test('writeMlowRed leaves out a copy over 255 bytes, empty, or out of the 10 ms reach', () => {
    const target = new Uint8Array(1024)
    const primary = Uint8Array.from([0x50, 1])
    const edge = Uint8Array.from([0x50, 3])
    const fits = Uint8Array.from([0x50, 2])
    const copies = [new Uint8Array(256).fill(0x50), new Uint8Array(0), fits, fits, fits, edge, fits]
    const stamps = [29_040, 29_040, 9_520, 30_000, 29_000, 9_680, 29_040]

    const length = writeMlowRed(target, primary, 30_000, copies, stamps)

    assert.deepEqual(
        target.subarray(0, length),
        Uint8Array.from([0xff, 2, 0x86, 2, 0x00, 0x50, 3, 0x50, 2, 0x50, 1]),
        '1270 ms back is the last 7-bit step; 1280 ms, the same slot and 62.5 ms are left out'
    )
    const alone = writeMlowRed(target, primary, 30_000, [], [])
    assert.deepEqual(
        target.subarray(0, alone),
        Uint8Array.from([0x00, 0x50, 1]),
        'level 0 still frames the primary'
    )
})

test('readMlowRed reads the headers while F is set, the 0x00, the copies, then the primary', () => {
    const packet = Uint8Array.from([0x84, 3, 0x82, 2, 0x00, 0x48, 9, 9, 0x48, 7, 0x50, 1, 2, 3])
    const bounds = new Int32Array(RED_BOUNDS_LENGTH)

    assert.equal(readMlowRed(packet, bounds), 2)
    assert.deepEqual(
        [...bounds.subarray(0, 8)],
        [5, 3, 640, 8, 2, 320, 10, 4],
        'Δ in 10 ms units placed at 160 samples each on the 16 kHz clock'
    )

    assert.equal(readMlowRed(Uint8Array.from([0x86, 1, 0x00, 0x50, 0x50, 5]), bounds), 1)
    assert.equal(bounds[2], 960, '0x86 is the frame 60 ms before')

    assert.equal(readMlowRed(Uint8Array.from([0x00, 0x50, 1]), bounds), 0, 'level 0')
    assert.deepEqual([...bounds.subarray(0, 2)], [1, 2])
})

test('readMlowRed takes a plain frame or a broken header for no RED', async () => {
    const bounds = new Int32Array(RED_BOUNDS_LENGTH)
    const codec = await MLowCodec.create()
    try {
        assert.equal(
            readMlowRed(codec.encode(voicedFrame()), bounds),
            -1,
            'a frame opens on its TOC'
        )
    } finally {
        codec.destroy()
    }
    assert.equal(readMlowRed(Uint8Array.from([0x08]), bounds), -1, 'a DTX frame')
    assert.equal(
        readMlowRed(Uint8Array.from([0x86, 2, 0x50, 1, 0x50, 9]), bounds),
        -1,
        'the copy right behind its header, with no 0x00'
    )
    assert.equal(
        readMlowRed(Uint8Array.from([0x86, 200, 0x00, 0x50, 1]), bounds),
        -1,
        'copy past the end'
    )
    assert.equal(readMlowRed(Uint8Array.from([0x86, 1, 0x00, 0x50]), bounds), -1, 'no primary left')
    assert.equal(readMlowRed(Uint8Array.from([0x86, 0, 0x00, 0x50, 1]), bounds), -1, 'empty copy')
    assert.equal(readMlowRed(Uint8Array.from([0x00]), bounds), -1, 'a lone primary header')
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
