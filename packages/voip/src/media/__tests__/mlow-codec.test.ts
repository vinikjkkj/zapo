import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger, type Logger } from 'zapo-js'

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
