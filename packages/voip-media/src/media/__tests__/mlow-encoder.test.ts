import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MLowCodec } from '../mlow-codec.js'
import { MLOW_ENCODER_CTL } from '../WaMlowEncoder.js'

import { captureWarnings, voicedFrame } from './_mlow-helpers.js'

test('MLowCodec rejects an encode frame that is not exactly one frame long', async () => {
    const codec = await MLowCodec.create()
    try {
        assert.throws(() => codec.encode(new Float32Array(480)), /960 samples/)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec clamps the expected packet loss percentage', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({ logger })
    try {
        for (const percent of [140, -5, Number.NaN, 12.4, 100]) {
            codec.setExpectedPacketLossPercent(percent)
        }
        assert.deepEqual(warnings, [], 'the encoder only sees 0 to 100')

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
    const codec = await MLowCodec.create({
        logger,
        tunables: { subframeImportance: Number.MAX_SAFE_INTEGER }
    })
    try {
        assert.deepEqual(warnings, ['mlow encoder ctl rejected'])
        assert.ok(codec.encode(voicedFrame()).length > 0)
    } finally {
        codec.destroy()
    }
})

test('MLowCodec leaves tunables unset when none are given', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({ logger, tunables: {} })
    try {
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
