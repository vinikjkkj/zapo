import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WaOutboundAudio } from '../../call/WaOutboundAudio.js'
import { createNoopLogger } from '../../logger.js'
import { loadMlowModule, MLOW_SET_USE_SMPL_CTL } from '../mlow-binding.js'
import { MLowCodec } from '../mlow-codec.js'
import { mlowPacketSamples, opusPacketSamples } from '../mlow-packet.js'
import { WaMediaClock } from '../WaMediaClock.js'

import { voicedFrame } from './_mlow-helpers.js'

const FRAME = 960
/** TOC config 11: SILK wideband, 60 ms (RFC 6716 §3.1). */
const SILK_WB_60MS = 11

function rms(pcm: Float32Array): number {
    let sum = 0
    for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
    return Math.sqrt(sum / Math.max(1, pcm.length))
}

/**
 * 60 ms standard Opus packets, the shape a client that falls back from SMPL sends on PT 120:
 * a SILK wideband TOC (`0x58`), one frame per packet, the RTP clock moving 960 per packet.
 */
async function plainOpusPackets(count: number): Promise<Uint8Array[]> {
    const frameSize = FRAME
    const lib = await loadMlowModule()
    const encoder = await lib.createEncoder({
        channels: 1,
        sampleRate: 16_000,
        application: 2048,
        frameSize,
        useSmpl: false,
        bitrate: 16_000
    })
    try {
        const pcm = new Int16Array(frameSize)
        const target = new Uint8Array(4_000)
        const packets: Uint8Array[] = []
        for (let index = 0; index < count; index++) {
            for (let i = 0; i < frameSize; i++) {
                pcm[i] = Math.round(
                    Math.sin((2 * Math.PI * 440 * (index * frameSize + i)) / 16_000) * 0.25 * 32_767
                )
            }
            packets.push(target.slice(0, encoder.encodeInto(pcm, target)))
        }
        return packets
    } finally {
        encoder.free()
    }
}

/**
 * Two 60 ms frames in one code 2 packet (RFC 6716 §3.2.3): the TOC with code 2, the first frame's
 * length, then both frames. The fallback client's 120 ms packets have this shape (`0x5a`).
 */
function pairs(singles: readonly Uint8Array[]): Uint8Array[] {
    const out: Uint8Array[] = []
    for (let index = 0; index + 1 < singles.length; index += 2) {
        const first = singles[index].subarray(1)
        const second = singles[index + 1].subarray(1)
        assert.ok(first.length < 252, 'one length byte')
        const packet = new Uint8Array(2 + first.length + second.length)
        packet[0] = (singles[index][0] & 0xfc) | 2
        packet[1] = first.length
        packet.set(first, 2)
        packet.set(second, 2 + first.length)
        out.push(packet)
    }
    return out
}

test('opusPacketSamples reads the TOC as standard Opus, which SMPL reads differently', () => {
    const bounds = new Int32Array(36)
    // One 60 ms SILK wideband frame; the same byte is one 120 ms frame to SMPL.
    assert.equal(opusPacketSamples(Uint8Array.of(0x58, 0)), 960)
    assert.equal(mlowPacketSamples(Uint8Array.of(0x58, 0), bounds), 1920)
    // Two frames, equal (code 1) and unequal (code 2) in size.
    assert.equal(opusPacketSamples(Uint8Array.of(0x59, 0)), 1920)
    assert.equal(opusPacketSamples(Uint8Array.of(0x5a, 0)), 1920)
    // Code 3 counts its frames in the second byte.
    assert.equal(opusPacketSamples(Uint8Array.of(0x5b, 0x03)), 2880)
    assert.equal(opusPacketSamples(Uint8Array.of(0x5b)), 0)
    // SMPL's 60 ms TOC is a 40 ms SILK frame to Opus; a 10 ms DTX frame is 10 ms to both.
    assert.equal(opusPacketSamples(Uint8Array.of(0x50, 0)), 640)
    assert.equal(opusPacketSamples(Uint8Array.of(0x00)), 160)
    assert.equal(mlowPacketSamples(Uint8Array.of(0x00), bounds), 160)
    assert.equal(opusPacketSamples(new Uint8Array(0)), 0)
})

test('a peer sending standard Opus on PT 120 is decoded as Opus once the timeline shows it', async () => {
    const codec = await MLowCodec.create({ decodeOnly: true })
    try {
        const packets = await plainOpusPackets(12)
        assert.equal(packets[0][0] >> 3, SILK_WB_60MS, 'the fixture is the fallback shape')
        const frames: Float32Array[][] = []
        packets.forEach((packet, index) => {
            const out: Float32Array[] = []
            codec.decodeSequenced(
                index + 1,
                packet,
                (pcm) => out.push(pcm.slice()),
                24_000 + index * FRAME
            )
            frames.push(out)
        })

        assert.equal(codec.peerSendsPlainOpus, true)
        // Before the switch the SMPL decoder turns each 60 ms packet into 120 ms of silence.
        const settled = frames.slice(5).flat()
        assert.ok(settled.length >= 6)
        for (const pcm of settled) {
            assert.equal(pcm.length, FRAME, 'one 60 ms packet plays 60 ms')
        }
        assert.ok(rms(settled[settled.length - 1]) > 0.05, 'the tone comes through')
    } finally {
        codec.destroy()
    }
})

test('a standard Opus peer that mixes 60 and 120 ms packets plays in real time', async () => {
    const codec = await MLowCodec.create({ decodeOnly: true })
    try {
        // As captured from the falling-back client: runs of 60 ms packets, then 120 ms ones.
        const short = await plainOpusPackets(8)
        const long = pairs(await plainOpusPackets(16))
        assert.ok(opusPacketSamples(long[0]) === 2 * FRAME, 'a 120 ms Opus packet')
        const stream = [...short, ...long, ...short]
        let ts = 30_000
        let emitted = 0
        stream.forEach((packet, index) => {
            const span = opusPacketSamples(packet)
            codec.decodeSequenced(
                index + 1,
                packet,
                (pcm) => {
                    if (index >= 4) emitted += pcm.length
                },
                ts
            )
            ts += span
        })
        const expected = stream.slice(4).reduce((sum, packet) => sum + opusPacketSamples(packet), 0)
        assert.equal(codec.peerSendsPlainOpus, true)
        assert.equal(emitted, expected, 'no packet plays longer than the timeline moves')
    } finally {
        codec.destroy()
    }
})

test('an SMPL peer on the same timeline stays on SMPL', async () => {
    const codec = await MLowCodec.create()
    try {
        let emitted = 0
        for (let index = 0; index < 12; index++) {
            const packet = codec.encode(voicedFrame(index * FRAME))
            codec.decodeSequenced(
                index + 1,
                packet,
                (pcm) => (emitted += pcm.length),
                index * FRAME
            )
        }
        assert.equal(codec.peerSendsPlainOpus, false)
        assert.equal(codec.plainOpusActive, false)
        assert.equal(emitted, 12 * FRAME)
    } finally {
        codec.destroy()
    }
})

test('the encoder answers a standard Opus peer in standard Opus, one frame per packet', async () => {
    const codec = await MLowCodec.create({ red: true })
    try {
        assert.equal(codec.redActive, true)
        const packets = await plainOpusPackets(6)
        packets.forEach((packet, index) =>
            codec.decodeSequenced(index + 1, packet, () => {}, index * FRAME)
        )
        assert.equal(codec.plainOpusActive, true)
        assert.equal(codec.redActive, false, 'in-band RED is SMPL only')

        // What goes out must decode on a plain Opus decoder.
        const lib = await loadMlowModule()
        const decoder = await lib.createDecoder({
            channels: 1,
            sampleRate: 16_000,
            useSmpl: true,
            maxFrameSize: 1920
        })
        decoder.decoderCtl(MLOW_SET_USE_SMPL_CTL, 0)
        try {
            const time = { ms: 1_000 }
            const clock = new WaMediaClock(() => time.ms)
            clock.start()
            const sent: Uint8Array[] = []
            const outbound = new WaOutboundAudio({
                logger: createNoopLogger(),
                clock,
                send: (payload) => sent.push(payload.slice())
            })
            outbound.setFramesPerPacket(2)
            for (let index = 0; index < 6; index++) {
                outbound.encode(codec, voicedFrame(index * FRAME), time.ms)
                time.ms += 60
            }
            assert.ok(sent.length >= 5, `frames went out (${sent.length})`)
            const out = new Float32Array(1920)
            for (const payload of sent) {
                assert.equal(payload[0] >> 3, SILK_WB_60MS, 'a standard Opus TOC, no multiframe')
                assert.equal(decoder.decodeFloatInto(out, payload), FRAME)
            }
            assert.ok(rms(out.subarray(0, FRAME)) > 0.05)
        } finally {
            decoder.free()
        }
    } finally {
        codec.destroy()
    }
})

test('a lost 120 ms packet after a run of 60 ms ones is filled for its whole span', async () => {
    const codec = await MLowCodec.create({ decodeOnly: true })
    try {
        const short = await plainOpusPackets(8)
        const long = pairs(await plainOpusPackets(8))
        const stream = [...short, ...long]
        const lost = short.length // the first 120 ms packet; the last decoded one was 60 ms
        let ts = 30_000
        let emitted = 0
        stream.forEach((packet, index) => {
            const span = opusPacketSamples(packet)
            if (index !== lost) {
                codec.decodeSequenced(
                    index + 1,
                    packet,
                    (pcm) => {
                        if (index >= 4) emitted += pcm.length
                    },
                    ts
                )
            }
            ts += span
        })
        const expected = stream.slice(4).reduce((sum, packet) => sum + opusPacketSamples(packet), 0)
        assert.equal(codec.peerSendsPlainOpus, true)
        assert.equal(emitted, expected, 'the hole is concealed as long as the timeline moved')
    } finally {
        codec.destroy()
    }
})

test('a codec switch the library refuses is not retried on every packet', async () => {
    const codec = await MLowCodec.create()
    try {
        const internals = codec as unknown as {
            decoder: { lib: { decoderCtl: (request: number, value: number) => void } }
            encoder: { encoder: { encoderCtl: (request: number, value: number) => void } }
        }
        let decoderCalls = 0
        internals.decoder.lib.decoderCtl = () => {
            decoderCalls++
            throw new Error('refused')
        }
        const packets = await plainOpusPackets(12)
        packets.forEach((packet, index) =>
            codec.decodeSequenced(index + 1, packet, () => {}, index * FRAME)
        )
        assert.equal(codec.peerSendsPlainOpus, false)
        // Three consistent steps per try: 11 steps give 3 tries, not one per packet.
        assert.equal(decoderCalls, 3)
    } finally {
        codec.destroy()
    }

    const answering = await MLowCodec.create()
    try {
        const internals = answering as unknown as {
            encoder: { encoder: { encoderCtl: (request: number, value: number) => void } }
        }
        let encoderCalls = 0
        internals.encoder.encoder.encoderCtl = () => {
            encoderCalls++
            throw new Error('refused')
        }
        const packets = await plainOpusPackets(12)
        packets.forEach((packet, index) =>
            answering.decodeSequenced(index + 1, packet, () => {}, index * FRAME)
        )
        assert.equal(answering.peerSendsPlainOpus, true)
        assert.equal(answering.plainOpusActive, false)
        assert.equal(encoderCalls, 1, 'tried once while the peer codec stays the same')
    } finally {
        answering.destroy()
    }
})

test('a frame held for bundling before the switch to standard Opus is not sent', async () => {
    const codec = await MLowCodec.create()
    try {
        const time = { ms: 1_000 }
        const clock = new WaMediaClock(() => time.ms)
        clock.start()
        const sent: Uint8Array[] = []
        const outbound = new WaOutboundAudio({
            logger: createNoopLogger(),
            clock,
            send: (payload) => sent.push(payload.slice())
        })
        outbound.setFramesPerPacket(2)
        // One voiced SMPL frame waits for its pair.
        outbound.encode(codec, voicedFrame(0), time.ms)
        time.ms += 60
        assert.equal(sent.length, 0, 'held for bundling')

        // The peer turns out to send standard Opus: the encoder follows.
        const packets = await plainOpusPackets(6)
        packets.forEach((packet, index) =>
            codec.decodeSequenced(index + 1, packet, () => {}, index * FRAME)
        )
        assert.equal(codec.plainOpusActive, true)

        for (let index = 1; index < 4; index++) {
            outbound.encode(codec, voicedFrame(index * FRAME), time.ms)
            time.ms += 60
        }
        assert.ok(sent.length >= 2, `frames went out (${sent.length})`)
        for (const payload of sent) {
            assert.equal(payload[0] >> 3, SILK_WB_60MS, 'only standard Opus after the switch')
        }
    } finally {
        codec.destroy()
    }
})
