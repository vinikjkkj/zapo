import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MLowCodec } from '../mlow-codec.js'
import {
    MLOW_MAX_RED_BLOCKS,
    MLOW_MAX_SUBFRAMES,
    MlowPacketRead,
    mlowPacketSamples,
    readMlowRed,
    writeMlowRed
} from '../mlow-packet.js'

import { ANDROID_PT121_STREAM, OFFICIAL_MLOW_PACKETS, WEB_PT121_STREAM } from './_mlow-captures.js'
import { parsesAsMlow, pt121Corpus, redundantPackets, voicedFrame } from './_mlow-helpers.js'

/** Samples of sub-frame `index` of a multiframe whose `bounds` were just filled. */
function subframeSamples(packet: Uint8Array, bounds: Int32Array, index: number): number {
    const offset = bounds[index * 2]
    const subframe = packet.subarray(offset, offset + bounds[index * 2 + 1])
    return mlowPacketSamples(subframe, new Int32Array(MLOW_MAX_SUBFRAMES * 2))
}

test('the official packets split into two 60 ms sub-frames that fill the timestamp step', () => {
    const bounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    for (let index = 0; index < OFFICIAL_MLOW_PACKETS.length; index++) {
        const { payload, timestamp, sequenceNumber } = OFFICIAL_MLOW_PACKETS[index]
        assert.equal(mlowPacketSamples(payload, bounds), 1920)
        assert.equal(payload[0], 0x92)
        assert.equal(payload[1], 0x02)
        assert.deepEqual([bounds[0], bounds[1]], [3, payload[2]])
        assert.equal(bounds[2], 3 + payload[2])
        assert.equal(bounds[2] + bounds[3], payload.length)
        assert.equal(payload[bounds[0]], 0x50)
        assert.equal(payload[bounds[2]], 0x50)

        const span = subframeSamples(payload, bounds, 0) + subframeSamples(payload, bounds, 1)
        assert.equal(span, 1920)
        const next = OFFICIAL_MLOW_PACKETS[index + 1]
        if (next) {
            assert.equal(next.sequenceNumber - sequenceNumber, 1)
            assert.equal(next.timestamp - timestamp, span, 'no sub-frame repeats an earlier slot')
        }
    }
})

test('RED packets keep the official framing, the copy first on the slot of the frame before', async () => {
    const packets = await redundantPackets(3)
    const official = OFFICIAL_MLOW_PACKETS[0].payload
    const bounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    for (const { payload, primary, copy } of packets.slice(1)) {
        assert.ok(copy)
        assert.equal(mlowPacketSamples(payload, bounds), 1920)
        assert.equal(payload[0], official[0])
        assert.equal(payload[1], official[1])
        assert.equal(payload[2], copy.length)
        assert.deepEqual(payload.subarray(bounds[0], bounds[0] + bounds[1]), copy)
        assert.deepEqual(payload.subarray(bounds[2]), primary)
        assert.equal(payload[bounds[0]] & 0x39, official[3] & 0x39, 'same rate, duration, channels')
        assert.equal(subframeSamples(payload, bounds, 0), 960)
        assert.equal(subframeSamples(payload, bounds, 1), 960)
    }
    assert.deepEqual(
        packets.map((packet) => packet.timestamp),
        [0, 0, 960],
        'stamped on the copy, so the primary of frame n lands on n * 960'
    )
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

test('one MlowPacketRead accepts exactly the PT 121 packets the two-read check did', async () => {
    const read = new MlowPacketRead()
    for (const payload of await pt121Corpus()) {
        assert.equal(
            read.read(payload),
            parsesAsMlow(payload),
            Buffer.from(payload).toString('hex')
        )
    }
})
