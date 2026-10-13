import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MLowCodec } from '../mlow-codec.js'

import { voicedFrame } from './_mlow-helpers.js'

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

test('a rejected packet decodes to silence the caller owns', async () => {
    const codec = await MLowCodec.create()
    try {
        const rejected = Uint8Array.of(0x92, 0x02, 0xff, 0x50)
        const first = codec.decode(rejected)
        assert.equal(codec.getStats().errors, 1)
        assert.ok(first.every((sample) => sample === 0))
        first.fill(0.5)
        const second = codec.decode(rejected)
        assert.ok(
            second.every((sample) => sample === 0),
            'writing into one left the next silent'
        )
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
