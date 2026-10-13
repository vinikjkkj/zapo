import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { readUInt32BE } from '../../bytes.js'
import { createNoopLogger } from '../../logger.js'
import { MLowCodec } from '../../media/mlow-codec.js'
import { RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaReceiver } from '../remote.js'
import { WaCallMediaPlane, type WaCallMediaPlaneOptions } from '../WaCallMediaPlane.js'

const SELF_AUDIO = 0x11111111
const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: 0x22222222,
    selfAppData: 0x66666666,
    selfStreams: [SELF_AUDIO, 0x66666666],
    selfVideoStreams: [0x22222222],
    peerAudio: 0x33333333,
    peerStreams: [0x33333333, 0x77777777],
    peerVideoStreams: [0x44444444],
    peerAppData: [0x77777777]
}

const FRAME_SAMPLES = 960
const FRAME_MS = 60
const START_MS = 5_000_000

/** Multiframe marker: bits 7 and 1 set, below the CELT range. */
function isMultiframe(payload: Uint8Array): boolean {
    return (payload[0] & 0x82) === 0x82 && payload[0] < 0xc0
}

/** The sub-frames of a two-frame packet, split on the length byte that follows the count. */
function subframesOf(payload: Uint8Array): Uint8Array[] {
    if (!isMultiframe(payload)) return [payload]
    assert.equal(payload[1] & 0x3f, 2, 'this sender only bundles two frames')
    const firstLength = payload[2]
    return [payload.subarray(3, 3 + firstLength), payload.subarray(3 + firstLength)]
}

function voicedFrame(index: number): Float32Array {
    const frame = new Float32Array(FRAME_SAMPLES)
    for (let i = 0; i < frame.length; i++) {
        const t = index * FRAME_SAMPLES + i
        frame[i] = Math.sin((2 * Math.PI * 220 * t) / 16_000) * 0.3
    }
    return frame
}

/** A relay that is always up and keeps what the plane sends. */
class RecordingRelay {
    readonly sent: Uint8Array[] = []
    setSsrc(): void {}
    setSubscriptionSsrc(): void {}
    setStreamSsrcs(): void {}
    setParticipantIds(): void {}
    resendSubscriptions(): void {}
    hasConnection(): boolean {
        return true
    }
    setMediaFlowing(): void {}
    sendMedia(data: ArrayBuffer): boolean {
        this.sent.push(new Uint8Array(data))
        return true
    }
    cleanup(): void {}
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly relay: RecordingRelay
    readonly time: { ms: number }
}

/** A plane on the real codec, pass-through SRTP and a recording relay; accepted. */
async function createPlane(
    options: Partial<WaCallMediaPlaneOptions> = {},
    framesPerPacket?: number
): Promise<Harness> {
    const time = { ms: START_MS }
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        now: () => time.ms,
        ...options
    })
    await plane.start()
    const internals = plane as unknown as {
        sctpRelay: RecordingRelay
        srtpSession: { protect: (packet: RtpPacket) => Uint8Array }
        srtcpContext: { protect: (rtcp: Uint8Array) => Uint8Array }
    }
    const relay = new RecordingRelay()
    internals.sctpRelay = relay
    await plane.apply({
        mediaType: 'audio',
        ssrcs: SSRCS,
        ...(framesPerPacket === undefined
            ? {}
            : {
                  settings: {
                      rtcpIntervalMs: null,
                      disableRtcpRemb: false,
                      appDataSframe: false,
                      audioFramesPerPacket: framesPerPacket
                  }
              })
    })
    internals.srtpSession = { protect: (packet) => packet.encode() }
    internals.srtcpContext = { protect: (rtcp) => rtcp }
    await plane.apply({ accepted: true })
    return { plane, relay, time }
}

/** Pushes `frames` back to back, the first captured at `fromMs`. */
function push(harness: Harness, frames: readonly Float32Array[], fromMs = START_MS): void {
    for (let index = 0; index < frames.length; index++) {
        const capturedAt = fromMs + index * FRAME_MS
        harness.time.ms = Math.max(harness.time.ms, capturedAt + FRAME_MS)
        harness.plane.pushCapture(frames[index], capturedAt)
    }
}

/** Our audio RTP packets, in the order they went out. */
function audioPackets(relay: RecordingRelay): RtpPacket[] {
    return relay.sent
        .filter((data) => (data[1] < 200 || data[1] > 207) && readUInt32BE(data, 8) === SELF_AUDIO)
        .map((data) => RtpPacket.decode(data))
}

function voicedFrames(count: number, from = 0): Float32Array[] {
    return Array.from({ length: count }, (_, index) => voicedFrame(from + index))
}

test('without voip settings every 60 ms frame goes out in a packet of its own', async (t) => {
    const harness = await createPlane()
    t.after(() => harness.plane.stop())

    push(harness, voicedFrames(4))

    const packets = audioPackets(harness.relay)
    assert.equal(packets.length, 4)
    for (let index = 0; index < packets.length; index++) {
        assert.equal(isMultiframe(packets[index].payload), false)
        if (index > 0) {
            assert.equal(packets[index].header.timestamp - packets[index - 1].header.timestamp, 960)
        }
    }
})

test('with maxfpp 2 two frames share a packet, byte for byte what the repacketizer writes', async (t) => {
    const harness = await createPlane({}, 2)
    t.after(() => harness.plane.stop())
    const twin = await MLowCodec.create()
    t.after(() => twin.destroy())

    const frames = voicedFrames(4)
    push(harness, frames)

    const packets = audioPackets(harness.relay)
    assert.equal(packets.length, 2)
    for (let index = 0; index < packets.length; index++) {
        const first = twin.encode(frames[index * 2])
        const second = twin.encode(frames[index * 2 + 1])
        const payload = packets[index].payload
        assert.deepEqual(payload, twin.packFrames([first, second]))
        assert.equal(payload[0], 0x92)
        assert.equal(payload[1], 0x02)
        assert.equal(payload[2], first.length)
        assert.equal(payload[3] & 0xf9, 0x50)
    }
    assert.equal(packets[1].header.timestamp - packets[0].header.timestamp, 1920)
    assert.equal(packets[1].header.sequenceNumber - packets[0].header.sequenceNumber, 1)
    assert.equal(packets[0].header.marker, true, 'the stream opens marked')
    assert.equal(packets[1].header.marker, false)
})

test('when the VAD closes the frame left waiting goes out alone, never bundled with silence', async (t) => {
    const harness = await createPlane({}, 2)
    t.after(() => harness.plane.stop())

    push(harness, [...voicedFrames(3), ...Array.from({ length: 12 }, () => new Float32Array(960))])

    const packets = audioPackets(harness.relay)
    let sawSilence = false
    for (let index = 0; index < packets.length; index++) {
        const subframes = subframesOf(packets[index].payload)
        const silent = subframes.some((frame) => (frame[0] & 0x40) === 0)
        if (silent) {
            sawSilence = true
            assert.equal(subframes.length, 1, 'a frame with the VAD bit clear is never bundled')
        }
        if (index > 0) {
            const previous = subframesOf(packets[index - 1].payload).length
            assert.equal(
                packets[index].header.timestamp - packets[index - 1].header.timestamp,
                previous * 960,
                'the timestamp steps by what the previous packet carried'
            )
        }
    }
    assert.ok(sawSilence)
    const firstSilent = packets.findIndex((packet) =>
        subframesOf(packet.payload).some((frame) => (frame[0] & 0x40) === 0)
    )
    const voiced = packets.slice(0, firstSilent).map((packet) => subframesOf(packet.payload))
    const voicedFrameCount = voiced.reduce((sum, frames) => sum + frames.length, 0)
    for (let index = 0; index < voiced.length - 1; index++) {
        assert.equal(voiced[index].length, 2, 'voiced frames ahead of the silence are bundled')
    }
    assert.equal(
        voiced[voiced.length - 1].length,
        voicedFrameCount % 2 === 1 ? 1 : 2,
        'an odd voiced frame left waiting goes out alone when the VAD closes'
    )
})

test('a capture pause sends the waiting frame alone and resumes on a marked bundle', async (t) => {
    const harness = await createPlane({}, 2)
    t.after(() => harness.plane.stop())

    push(harness, voicedFrames(1))
    push(harness, voicedFrames(2, 10), START_MS + 1_000)

    const packets = audioPackets(harness.relay)
    assert.equal(packets.length, 2)
    assert.equal(isMultiframe(packets[0].payload), false)
    assert.equal(isMultiframe(packets[1].payload), true)
    assert.equal(packets[1].header.marker, true)
})

test('the 120 ms packets decode back at their length on the receiving side', async (t) => {
    const harness = await createPlane({}, 2)
    t.after(() => harness.plane.stop())
    const receiver = await MLowCodec.create()
    t.after(() => receiver.destroy())

    push(harness, voicedFrames(8))

    const lengths: number[] = []
    for (const packet of audioPackets(harness.relay)) {
        receiver.decodeSequenced(packet.header.sequenceNumber, packet.payload, (pcm) =>
            lengths.push(pcm.length)
        )
    }
    assert.deepEqual(lengths, [1920, 1920, 1920, 1920])
})

test('with RED each packet carries the copy of the frame before, then the frame, on the copy slot', async (t) => {
    const harness = await createPlane({ mlowRed: true }, 2)
    t.after(() => harness.plane.stop())
    const twin = await MLowCodec.create({ red: true })
    t.after(() => twin.destroy())
    const receiver = await MLowCodec.create()
    t.after(() => receiver.destroy())

    const frames = voicedFrames(4)
    push(harness, frames)

    const packets = audioPackets(harness.relay)
    assert.equal(packets.length, 4, 'RED carries one primary per packet')
    const base = packets[0].header.timestamp
    let copy: Uint8Array | null = null
    for (let index = 0; index < packets.length; index++) {
        const primary = twin.encode(frames[index])
        const { header, payload } = packets[index]
        assert.deepEqual(payload, copy ? twin.packFrames([copy, primary]) : primary)
        if (copy) {
            assert.equal(payload[0], 0x92)
            assert.equal(payload[1], 0x02)
            assert.equal(payload[2], copy.length)
        }
        assert.equal(
            header.timestamp - base,
            copy ? (index - 1) * 960 : 0,
            'stamped on the copy, the first sub-frame'
        )
        assert.equal(header.marker, index === 0)
        copy = twin.lastSecondary
    }

    const lengths: number[] = []
    for (const packet of packets) {
        receiver.decodeSequenced(
            packet.header.sequenceNumber,
            packet.payload,
            (pcm) => lengths.push(pcm.length),
            packet.header.timestamp
        )
    }
    assert.deepEqual(lengths, [960, 960, 960, 960], 'no copy is played as audio')
    assert.equal(receiver.getStats().redundant, 3)
})

test('with RED a capture pause sends the next frame alone, marked, without a stale copy', async (t) => {
    const harness = await createPlane({ mlowRed: true })
    t.after(() => harness.plane.stop())

    push(harness, voicedFrames(2))
    push(harness, voicedFrames(2, 10), START_MS + 1_000)

    const packets = audioPackets(harness.relay)
    assert.equal(packets.length, 4)
    assert.deepEqual(
        packets.map((packet) => [isMultiframe(packet.payload), packet.header.marker]),
        [
            [false, true],
            [true, false],
            [false, true],
            [true, false]
        ]
    )
    assert.equal(packets[3].header.timestamp, packets[2].header.timestamp)
})

test('with RED a lost packet plays back from the copy the next one carries', async (t) => {
    const harness = await createPlane({ mlowRed: true })
    t.after(() => harness.plane.stop())
    const twin = await MLowCodec.create({ red: true })
    t.after(() => twin.destroy())
    const receiver = await MLowCodec.create()
    t.after(() => receiver.destroy())
    const reference = await MLowCodec.create()
    t.after(() => reference.destroy())

    const frames = voicedFrames(6)
    push(harness, frames)

    const primaries: Uint8Array[] = []
    const copies: (Uint8Array | null)[] = []
    for (const frame of frames) {
        primaries.push(twin.encode(frame))
        copies.push(twin.lastSecondary)
    }
    const played: number[] = []
    const packets = audioPackets(harness.relay)
    assert.equal(packets.length, 6)
    for (let index = 0; index < packets.length; index++) {
        if (index === 3) continue
        const { header, payload } = packets[index]
        receiver.decodeSequenced(
            header.sequenceNumber,
            payload,
            (pcm) => played.push(...pcm),
            header.timestamp,
            0
        )
    }

    const expected: number[] = []
    const lostCopy = copies[3]
    assert.ok(lostCopy)
    for (const frame of [
        primaries[0],
        primaries[1],
        primaries[2],
        lostCopy,
        primaries[4],
        primaries[5]
    ]) {
        expected.push(...reference.decode(frame))
    }
    assert.deepEqual(played, expected, 'the copy fills the lost slot and nothing plays twice')
    const stats = receiver.getStats()
    assert.equal(stats.redRecovered, 1)
    assert.equal(stats.redundant, 3)
    assert.equal(stats.plc, 0)
    assert.equal(stats.fec, 0)
})

test('the Companion weights reach the codec of a plane and of a remote host', async () => {
    let loads = 0
    const loader = (): Promise<Uint8Array> => {
        loads++
        return Promise.reject(new Error('not on this machine'))
    }

    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        mlowCompanionModel: loader
    })
    await plane.start()
    plane.stop()

    const receiver = new WaCallMediaReceiver({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        callId: 'CALL',
        send: () => {},
        mlowCompanionModel: loader
    })
    await receiver.start()
    receiver.stop()

    assert.equal(loads, 2)
})
