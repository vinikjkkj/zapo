import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import {
    ANDROID_PT121_STREAM,
    type CapturedMlowPacket,
    WEB_PT121_STREAM
} from '../../media/__tests__/_mlow-captures.js'
import { MLowCodec } from '../../media/mlow-codec.js'
import { writeMlowRed } from '../../media/mlow-packet.js'
import type { RtpStreamReception } from '../../media/rtp-stream-reception.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const MLOW_PAYLOAD_TYPE = 120
/** `mlow-red-1`: a peer with the separate payload type on sends all of its audio here. */
const MLOW_RED_PAYLOAD_TYPE = 121
/** The PT 120 stream, on an SSRC and a numbering of its own, apart from the captured PT 121. */
const PEER_AUDIO_SSRC = 0x33333333
const PEER_AUDIO_FIRST_SEQUENCE = 40_000

interface PlaneInternals {
    srtpSession: { unprotect: (data: Uint8Array) => RtpPacket }
    sctpRelay: {
        setMediaFlowing: () => void
        sendMedia: (data: ArrayBuffer) => void
        hasConnection: () => boolean
        cleanup: () => void
        setSubscriptionSsrc: (ssrc: number) => void
        resendSubscriptions: () => void
    }
    codec: MLowCodec
    inboundAudio: {
        reception: RtpStreamReception
        onDecodedAudio: (pcm: Float32Array) => void
    }
    onRelayData: (data: Uint8Array) => void
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly internals: PlaneInternals
    /** Every frame handed to playout, copied. */
    readonly played: Float32Array[]
    readonly subscriptions: number[]
}

/** A plane with the real codec, SRTP pass-through and an inert relay that records subscriptions. */
async function createPlane(): Promise<Harness> {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })
    await plane.start()
    const internals = plane as unknown as PlaneInternals
    const played: Float32Array[] = []
    const subscriptions: number[] = []
    internals.sctpRelay = {
        setMediaFlowing: () => {},
        sendMedia: () => {},
        hasConnection: () => true,
        cleanup: () => {},
        setSubscriptionSsrc: (ssrc) => {
            subscriptions.push(ssrc)
        },
        resendSubscriptions: () => {}
    }
    internals.srtpSession = { unprotect: (data) => RtpPacket.decode(data) }
    internals.inboundAudio.onDecodedAudio = (pcm) => {
        played.push(pcm.slice())
    }
    return { plane, internals, played, subscriptions }
}

function inbound(
    payloadType: number,
    ssrc: number,
    packet: CapturedMlowPacket,
    sequenceNumber = packet.sequenceNumber
): Uint8Array {
    const header = new RtpHeader(payloadType, sequenceNumber, packet.timestamp, ssrc)
    return new RtpPacket(header, packet.payload).encode()
}

/** Each packet decoded once, in order, by a decoder of its own. */
async function referencePcm(packets: readonly CapturedMlowPacket[]): Promise<Float32Array[]> {
    const reference = await MLowCodec.create()
    try {
        return packets.map((packet) => reference.decode(packet.payload))
    } finally {
        reference.destroy()
    }
}

test('captured PT 121 packets decode and play as the audio they carry', async (t) => {
    for (const stream of [ANDROID_PT121_STREAM, WEB_PT121_STREAM]) {
        const harness = await createPlane()
        t.after(() => harness.plane.stop())

        for (const packet of stream.packets) {
            harness.internals.onRelayData(inbound(MLOW_RED_PAYLOAD_TYPE, stream.ssrc, packet))
        }

        assert.deepEqual(harness.played, await referencePcm(stream.packets))
        const stats = harness.plane.getStats()
        assert.equal(stats.audioReceived, stream.packets.length)
        assert.equal(stats.audioRedDiscarded, 0)
        assert.equal(stats.decodeErrors, 0)
        const codecStats = harness.internals.codec.getStats()
        assert.equal(codecStats.plc + codecStats.fec, 0, 'a DTX gap is not a loss')
    }
})

test('a frame that arrives on PT 120 and on PT 121 plays once, the second counted redundant', async (t) => {
    const harness = await createPlane()
    t.after(() => harness.plane.stop())
    const { packets, ssrc } = WEB_PT121_STREAM

    packets.forEach((packet, index) => {
        const sequence = PEER_AUDIO_FIRST_SEQUENCE + index
        const opus = inbound(MLOW_PAYLOAD_TYPE, PEER_AUDIO_SSRC, packet, sequence)
        const red = inbound(MLOW_RED_PAYLOAD_TYPE, ssrc, packet)
        for (const data of index % 2 === 0 ? [opus, red] : [red, opus]) {
            harness.internals.onRelayData(data)
        }
    })

    assert.deepEqual(harness.played, await referencePcm(packets))
    const codecStats = harness.internals.codec.getStats()
    assert.equal(codecStats.redundant, packets.length)
    assert.equal(codecStats.late, 0, 'neither numbering reads the other as out of order')
    assert.equal(codecStats.plc + codecStats.fec, 0)
    const report = harness.internals.inboundAudio.reception.report(Date.now())
    assert.equal(report.ssrc, PEER_AUDIO_SSRC, 'the report stays on the PT 120 stream')
    assert.equal(report.highestSequence, PEER_AUDIO_FIRST_SEQUENCE + packets.length - 1)
    assert.equal(report.packetsLost, 0)
})

test('a PT 121 packet that does not parse as MLow is discarded, counted, and latches nothing', async (t) => {
    const harness = await createPlane()
    t.after(() => harness.plane.stop())
    const payloads = [
        Uint8Array.of(0xfc, 0xff, 0xfe),
        Uint8Array.of(0x92, 0x02, 0xff, 0x50),
        Uint8Array.of(0x92, 0x02, 0x01, 0x50, 0xc0),
        new Uint8Array(0)
    ]

    payloads.forEach((payload, index) => {
        const packet = { sequenceNumber: index + 1, timestamp: index * 960, payload }
        harness.internals.onRelayData(inbound(MLOW_RED_PAYLOAD_TYPE, PEER_AUDIO_SSRC, packet))
    })

    assert.equal(harness.played.length, 0)
    const stats = harness.plane.getStats()
    assert.equal(stats.audioRedDiscarded, payloads.length)
    assert.equal(stats.audioReceived, 0)
    assert.equal(stats.decodeErrors, 0, 'never handed to the decoder')
    assert.deepEqual(harness.subscriptions, [])
})

test('a stream only on PT 121 plays continuously, concealing only the packet it lost', async (t) => {
    const harness = await createPlane()
    t.after(() => harness.plane.stop())
    const { packets, ssrc } = WEB_PT121_STREAM
    const lost = 4

    packets.forEach((packet, index) => {
        if (index !== lost) {
            harness.internals.onRelayData(inbound(MLOW_RED_PAYLOAD_TYPE, ssrc, packet))
        }
    })

    assert.deepEqual(
        harness.played.map((pcm) => pcm.length),
        Array(packets.length).fill(960),
        'one 60 ms frame per slot, the lost one concealed in place'
    )
    const codecStats = harness.internals.codec.getStats()
    assert.equal(codecStats.plc + codecStats.fec, 1)
    assert.equal(codecStats.late, 0)
    assert.equal(codecStats.redundant, 0)
    assert.deepEqual(harness.subscriptions, [ssrc], 'the PT 121 audio is the peer audio')
    const report = harness.internals.inboundAudio.reception.report(Date.now())
    assert.equal(report.ssrc, ssrc)
    assert.equal(report.packetsLost, 1)
})

test('in-band RED on PT 121 decodes as the audio it frames instead of being discarded', async (t) => {
    const harness = await createPlane()
    t.after(() => harness.plane.stop())
    const sender = await MLowCodec.create({ red: true })
    t.after(() => sender.destroy())

    const target = new Uint8Array(8_192)
    const primaries: CapturedMlowPacket[] = []
    let copy: Uint8Array | null = null
    for (let index = 0; index < 3; index++) {
        const frame = new Float32Array(960).map(
            (_, sample) => Math.sin((2 * Math.PI * 440 * (index * 960 + sample)) / 16_000) * 0.25
        )
        const timestamp = index * 960
        const primary = sender.encode(frame)
        primaries.push({ sequenceNumber: index + 1, timestamp, payload: primary })
        const length = copy
            ? writeMlowRed(target, primary, timestamp, [copy], [timestamp - 960])
            : writeMlowRed(target, primary, timestamp, [], [])
        const packet = { sequenceNumber: index + 1, timestamp, payload: target.slice(0, length) }
        harness.internals.onRelayData(inbound(MLOW_RED_PAYLOAD_TYPE, PEER_AUDIO_SSRC, packet))
        copy = sender.lastSecondary
    }

    assert.equal(harness.plane.getStats().audioRedDiscarded, 0)
    assert.deepEqual(harness.played, await referencePcm(primaries), 'only the primaries play')
})
