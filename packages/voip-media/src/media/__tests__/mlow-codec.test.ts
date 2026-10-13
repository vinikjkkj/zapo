import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MLowCodec } from '../mlow-codec.js'

import { captureWarnings, voicedFrame } from './_mlow-helpers.js'

test('MLowCodec initializes at 16 kHz with a 960-sample frame size', async () => {
    const codec = await MLowCodec.create()
    try {
        assert.equal(codec.getFrameSize(), 960)
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

/** A group call runs one decoder per remote sender; none of them needs an encoder. */
test('a decode-only codec decodes and conceals but refuses to encode or pack', async () => {
    const sender = await MLowCodec.create({ packetLossPercent: 20 })
    const receiver = await MLowCodec.create({ decodeOnly: true, red: true })
    try {
        const first = sender.encode(voicedFrame())
        sender.encode(voicedFrame(960))
        const third = sender.encode(voicedFrame(2 * 960))
        const frames: number[] = []
        const collect = (pcm: Float32Array): void => {
            frames.push(pcm.length)
        }

        assert.equal(receiver.decodeSequenced(1, first, collect), 'decoded')
        assert.equal(receiver.decodeSequenced(3, third, collect), 'decoded')

        assert.deepEqual(frames, [960, 960, 960], 'the lost packet is filled before the third')
        assert.equal(receiver.redActive, false)
        assert.throws(() => receiver.encode(voicedFrame()), /encoder not initialized/)
        assert.throws(() => receiver.packFrames([first, third]), /repacketizer not initialized/)
        assert.doesNotThrow(() => receiver.setExpectedPacketLossPercent(30))
    } finally {
        sender.destroy()
        receiver.destroy()
    }
})

test('MLowCodec decodes without the Companion when its model does not load', async () => {
    const { logger, warnings } = captureWarnings()
    const codec = await MLowCodec.create({ logger, companionModel: new Uint8Array([1, 2, 3, 4]) })
    try {
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
        assert.deepEqual(warnings, ['mlow companion unavailable, decoding without it'])
    } finally {
        codec.destroy()
    }
})

test('MLowCodec resets the Companion where the inbound sequence restarts', async () => {
    const codec = await MLowCodec.create()
    try {
        let resets = 0
        const decoder = (codec as unknown as { decoder: { lib: object } }).decoder.lib
        Object.defineProperty(decoder, 'hasCompanion', { value: true })
        Object.defineProperty(decoder, 'resetCompanion', { value: () => resets++ })

        codec.resetSequence()

        assert.equal(resets, 1)
    } finally {
        codec.destroy()
    }
})
