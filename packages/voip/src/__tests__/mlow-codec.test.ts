import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MLowCodec } from '../mlow-codec.js'

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
        const frame = new Float32Array(960)
        for (let i = 0; i < frame.length; i++) {
            frame[i] = Math.sin((2 * Math.PI * 440 * i) / 16_000) * 0.25
        }
        const packet = codec.encode(frame)
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
