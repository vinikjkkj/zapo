import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from '../../logger.js'
import { MLOW_ENCODER_CTL, MLowCodec } from '../mlow-codec.js'

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

/** Packets as the RED sender lays them out: each primary followed by the copy of the one before. */
async function redundantPackets(count: number): Promise<Uint8Array[]> {
    const sender = await MLowCodec.create({ red: true })
    try {
        const packets: Uint8Array[] = []
        let previous: Uint8Array | null = null
        for (let packet = 0; packet < count; packet++) {
            const primary = sender.encode(voicedFrame(packet * 960))
            packets.push(previous ? sender.packFrames([primary, previous]) : primary)
            previous = sender.lastSecondary
        }
        return packets
    } finally {
        sender.destroy()
    }
}

test('MLowCodec never plays a sub-frame past the span the timestamps give a packet', async () => {
    const packets = await redundantPackets(5)
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        for (let index = 0; index < packets.length; index++) {
            receiver.decodeSequenced(
                index + 1,
                packets[index],
                (pcm) => lengths.push(pcm.length),
                index * 960
            )
        }

        assert.deepEqual(lengths, [960, 960, 960, 960, 960], 'one 60 ms primary per packet')
        assert.equal(receiver.getStats().redundant, 3, 'each copy dropped once the next step lands')
        assert.equal(receiver.getStats().redRecovered, 0)
    } finally {
        receiver.destroy()
    }
})

test('MLowCodec recovers a lost packet from the copy the next one carries past its span', async () => {
    const packets = await redundantPackets(4)
    const receiver = await MLowCodec.create()
    try {
        const lengths: number[] = []
        const collect = (pcm: Float32Array): void => {
            lengths.push(pcm.length)
        }
        receiver.decodeSequenced(1, packets[0], collect, 0)
        receiver.decodeSequenced(2, packets[1], collect, 960)
        receiver.decodeSequenced(4, packets[3], collect, 2880)

        assert.deepEqual(lengths, [960, 960, 960, 960])
        const stats = receiver.getStats()
        assert.equal(stats.redRecovered, 1)
        assert.equal(stats.fec, 0, 'the redundant copy is preferred over in-band FEC')
        assert.equal(stats.plc, 0)
    } finally {
        receiver.destroy()
    }
})

test('MLowCodec plays a held sub-frame late when the timeline shows it was a primary', async () => {
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

        assert.deepEqual(lengths, [960, 960, 960, 1920], 'no audio of a plain stream is lost')
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
