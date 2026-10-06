import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { readUInt32BE } from '../../bytes.js'
import { createNoopLogger } from '../../logger.js'
import { SenderReportSchedule } from '../../media/rtcp.js'
import { RtpPacket } from '../../media/rtp.js'
import { MEDIA_CLOCK_ORIGIN_LEAD_MS } from '../../media/WaMediaClock.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { WaCallMediaRelays, WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const SELF_AUDIO = 0x11111111
const SELF_VIDEO = 0x22222222
const SELF_APP_DATA = 0x66666666
const PEER_AUDIO = 0x33333333
const PEER_VIDEO = 0x44444444
const PEER_APP_DATA = 0x77777777

const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: SELF_VIDEO,
    selfAppData: SELF_APP_DATA,
    selfStreams: [SELF_AUDIO, SELF_APP_DATA],
    selfVideoStreams: [SELF_VIDEO],
    peerAudio: PEER_AUDIO,
    peerStreams: [PEER_AUDIO, PEER_APP_DATA],
    peerVideoStreams: [PEER_VIDEO],
    peerAppData: [PEER_APP_DATA]
}

const RELAYS: WaCallMediaRelays = {
    endpoints: [
        {
            ip: '10.0.0.1',
            port: 3478,
            token: 'token',
            rawToken: new Uint8Array([1, 2, 3]),
            key: 'relay-key',
            relayId: 1,
            name: 'relay-a'
        }
    ],
    selfPid: 1,
    peerPid: 2
}

const AUDIO_CLOCK_RATE = 16_000
const VIDEO_CLOCK_RATE = 90_000
/** Samples of one codec frame, and the timestamp step of one audio packet. */
const FRAME_SAMPLES = 960
/** The same frame in milliseconds. */
const FRAME_MS = 60
/** The timeline's slack, in milliseconds: two frames. */
const SLACK_MS = 120
/** Where the time source of every plane here starts: no relation to zero, or to the host's video. */
const START_MS = 7_000_000

const FRAME = new Float32Array(FRAME_SAMPLES).fill(0.1)
const OPUS_FRAME = new Uint8Array([0xf8, 0xff, 0xfe])
/** One Annex-B IDR access unit, small enough to go out as a single packet. */
const KEY_FRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00])

/** A relay that is always up, unless told otherwise, and keeps what the plane sends. */
class FakeRelay {
    connected = true
    readonly sent: Uint8Array[] = []

    setSsrc(): void {}
    setSubscriptionSsrc(): void {}
    setStreamSsrcs(): void {}
    setParticipantIds(): void {}
    resendSubscriptions(): void {}
    async configureRelays(): Promise<void> {
        this.connected = true
    }
    hasConnection(): boolean {
        return this.connected
    }
    getConnectedCount(): number {
        return this.connected ? 1 : 0
    }
    sendMedia(data: ArrayBuffer): boolean {
        this.sent.push(new Uint8Array(data))
        return this.connected
    }
    cleanup(): void {}
}

/** A codec that encodes anything into the same few bytes, failing where told to. */
class FakeCodec {
    encodes = 0
    readonly failOn = new Set<number>()

    getFrameSize(): number {
        return FRAME_SAMPLES
    }
    encode(): Uint8Array {
        this.encodes++
        if (this.failOn.has(this.encodes)) throw new Error('encoder fault')
        return OPUS_FRAME
    }
    resetSequence(): void {}
    decodeSequenced(): void {}
    setExpectedPacketLossPercent(): void {}
    getStats(): { success: number; errors: number } {
        return { success: 0, errors: 0 }
    }
    destroy(): void {}
}

interface PlaneInternals {
    sctpRelay: FakeRelay
    codec: FakeCodec
    srtpSession: { protect: (packet: RtpPacket) => Uint8Array }
    srtcpContext: { protect: (rtcp: Uint8Array) => Uint8Array }
    audioReportSchedule: SenderReportSchedule
    videoReportSchedule: SenderReportSchedule
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly relay: FakeRelay
    readonly codec: FakeCodec
    readonly internals: PlaneInternals
    /** The plane's time source, moved by hand. */
    readonly time: { ms: number }
}

/** A plane on a hand-moved time source, pass-through SRTP and a recording relay; accepted. */
async function createPlane(
    mediaType: 'audio' | 'video',
    { accepted = true }: { readonly accepted?: boolean } = {}
): Promise<Harness> {
    const time = { ms: START_MS }
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        now: () => time.ms
    })
    const internals = plane as unknown as PlaneInternals
    const relay = new FakeRelay()
    const codec = new FakeCodec()
    internals.sctpRelay = relay
    internals.codec = codec
    await plane.apply({ mediaType, ssrcs: SSRCS })
    internals.srtpSession = { protect: (packet) => packet.encode() }
    internals.srtcpContext = { protect: (rtcp) => rtcp }
    if (accepted) await plane.apply({ accepted: true })
    return { plane, relay, codec, internals, time }
}

/** The clock's ticks for an instant, given the plane started at `START_MS`. */
function ticksAt(instantMs: number, clockRate: number): number {
    return Math.round(((instantMs - START_MS + MEDIA_CLOCK_ORIGIN_LEAD_MS) * clockRate) / 1000)
}

/** Pushes one frame captured at `capturedAtMs`, delivered when its last sample is. */
function pushFrame(harness: Harness, capturedAtMs: number): void {
    harness.time.ms = Math.max(harness.time.ms, capturedAtMs + FRAME_MS)
    harness.plane.pushCapture(FRAME, capturedAtMs)
}

/** Pushes `count` frames back to back, the first captured at `fromMs`. */
function pushFrames(harness: Harness, fromMs: number, count: number): void {
    for (let frame = 0; frame < count; frame++) pushFrame(harness, fromMs + frame * FRAME_MS)
}

/** Whether a packet the relay took is RTP and not RTCP. */
function isRtp(data: Uint8Array): boolean {
    return data[1] < 200 || data[1] > 207
}

/** The RTP packets of `ssrc`, decoded, in the order they went out. */
function rtpFrom(relay: FakeRelay, ssrc: number): RtpPacket[] {
    return relay.sent
        .filter((data) => isRtp(data) && readUInt32BE(data, 8) === ssrc)
        .map((data) => RtpPacket.decode(data))
}

/** The timestamp of the last RTP packet of `ssrc`, read straight off the bytes. */
function lastRtpTimestamp(relay: FakeRelay, ssrc: number): number {
    for (let index = relay.sent.length - 1; index >= 0; index--) {
        const data = relay.sent[index]
        if (isRtp(data) && readUInt32BE(data, 8) === ssrc) return readUInt32BE(data, 4)
    }
    return assert.fail(`no rtp packet of 0x${ssrc.toString(16)}`)
}

/** The sender reports of `ssrc`. */
function reportsFrom(relay: FakeRelay, ssrc: number): Uint8Array[] {
    return relay.sent.filter((data) => data[1] === 200 && readUInt32BE(data, 4) === ssrc)
}

/** Milliseconds between an audio and a video timestamp, as the receiver computes it. */
function videoMinusAudioMs(audioTimestamp: number, videoTimestamp: number): number {
    return (videoTimestamp * 1000) / VIDEO_CLOCK_RATE - (audioTimestamp * 1000) / AUDIO_CLOCK_RATE
}

/** Steps between consecutive timestamps, modulo 2^32. */
function steps(packets: readonly RtpPacket[]): number[] {
    const out: number[] = []
    for (let index = 1; index < packets.length; index++) {
        out.push((packets[index].header.timestamp - packets[index - 1].header.timestamp) >>> 0)
    }
    return out
}

/** Whether the sequence numbers run one by one, modulo 2^16. */
function sequential(packets: readonly RtpPacket[]): boolean {
    for (let index = 1; index < packets.length; index++) {
        const step =
            (packets[index].header.sequenceNumber - packets[index - 1].header.sequenceNumber) &
            0xffff
        if (step !== 1) return false
    }
    return true
}

/** Indexes of the packets that carry the marker. */
function markers(packets: readonly RtpPacket[]): number[] {
    const out: number[] = []
    for (let index = 0; index < packets.length; index++) {
        if (packets[index].header.marker) out.push(index)
    }
    return out
}

/** Unrelated origins overflowed the receiver's A/V difference and froze the video. */
test('audio and video captured on unrelated epochs land on one clock', async () => {
    const harness = await createPlane('video')
    // The host's video clock: a WebCodecs-like microsecond count of its own.
    const hostEpochUs = 9_000_000_000_000
    const videoLatencyMs = 15
    const videoAt = new Map<number, number>()
    let worst = 0

    for (let t = 0; t <= 3_000; t += 20) {
        harness.time.ms = START_MS + t
        if (t >= FRAME_MS && t % FRAME_MS === 0) {
            const captured = t - FRAME_MS
            harness.plane.pushCapture(FRAME, START_MS + captured)
            const video = videoAt.get(captured)
            if (video !== undefined) {
                const audio = lastRtpTimestamp(harness.relay, SELF_AUDIO)
                worst = Math.max(worst, Math.abs(videoMinusAudioMs(audio, video)))
            }
        }
        if (t % 40 === 0) {
            harness.time.ms = START_MS + t + videoLatencyMs
            assert.equal(harness.plane.sendVideoFrame(KEY_FRAME, hostEpochUs + t * 1000), 1)
            videoAt.set(t, lastRtpTimestamp(harness.relay, SELF_VIDEO))
        }
    }

    assert.ok(worst > 0, 'pairs captured at the same instant were compared')
    assert.ok(worst <= FRAME_MS, `audio and video ${worst} ms apart, more than one frame`)
    assert.ok(
        worst <= videoLatencyMs + 1,
        'the only distance left is the video latency the mapper cannot see'
    )
    harness.plane.stop()
})

test('the first audio timestamp sits inside the lead of the clock', async () => {
    const harness = await createPlane('audio')

    // No capture instant: the block is taken as just captured, ending now.
    harness.plane.pushCapture(FRAME)
    const [first] = rtpFrom(harness.relay, SELF_AUDIO)

    assert.ok(first.header.timestamp > 0)
    assert.ok(first.header.timestamp <= MEDIA_CLOCK_ORIGIN_LEAD_MS * 16)
    assert.equal(first.header.timestamp, ticksAt(START_MS - FRAME_MS, AUDIO_CLOCK_RATE))
    assert.equal(first.header.marker, true, 'the first packet of the stream is marked')
    harness.plane.stop()
})

test('an hour of call keeps the two streams within a frame, inside the receiver int32', async () => {
    const harness = await createPlane('video')
    const hostEpochUs = 123_456_789_000
    const hourMs = 3_600_000
    const videoAt = new Map<number, number>()
    let worst = 0
    let pairs = 0

    for (let t = 0; t <= hourMs; t += 20) {
        harness.time.ms = START_MS + t
        if (t >= FRAME_MS && t % FRAME_MS === 0) {
            const captured = t - FRAME_MS
            harness.plane.pushCapture(FRAME, START_MS + captured)
            const video = videoAt.get(captured)
            if (video !== undefined) {
                videoAt.delete(captured)
                const offsetMs = videoMinusAudioMs(
                    lastRtpTimestamp(harness.relay, SELF_AUDIO),
                    video
                )
                // The receiver holds the difference in microseconds, in a signed 32-bit integer.
                const offsetUs = Math.round(offsetMs * 1000)
                assert.equal(offsetUs | 0, offsetUs, `${offsetUs} us overflows the receiver`)
                worst = Math.max(worst, Math.abs(offsetMs))
                pairs++
            }
        }
        if (t % 300 === 0) {
            harness.time.ms = START_MS + t + 10
            harness.plane.sendVideoFrame(KEY_FRAME, hostEpochUs + t * 1000)
            videoAt.set(t, lastRtpTimestamp(harness.relay, SELF_VIDEO))
        }
        if (harness.relay.sent.length > 256) harness.relay.sent.length = 0
    }

    assert.equal(pairs, hourMs / 300)
    assert.ok(worst <= FRAME_MS, `the streams drifted ${worst} ms apart over the hour`)
    assert.equal(harness.plane.getStats().audioTimelineResyncs, 0)
    harness.plane.stop()
})

test('consecutive frames step by one frame, and jitter in their stamps moves nothing', async () => {
    const harness = await createPlane('audio')

    for (let frame = 0; frame < 40; frame++) {
        // Up to 40 ms either way, deterministic.
        const jitter = ((frame * 37) % 81) - 40
        harness.time.ms = START_MS + (frame + 1) * FRAME_MS + 40
        harness.plane.pushCapture(FRAME, START_MS + frame * FRAME_MS + jitter)
    }
    const packets = rtpFrom(harness.relay, SELF_AUDIO)

    assert.equal(packets.length, 40)
    assert.deepEqual(new Set(steps(packets)), new Set([FRAME_SAMPLES]))
    assert.ok(sequential(packets))
    assert.deepEqual(markers(packets), [0], 'only the first packet is marked')
    const stats = harness.plane.getStats()
    assert.equal(stats.audioTimelineResyncs, 0)
    assert.equal(stats.audioFramesShed, 0)
    assert.ok(
        stats.audioCaptureSkewMs >= 0 && stats.audioCaptureSkewMs <= 80,
        'the skew is the jitter around the first frame, nothing more'
    )
    harness.plane.stop()
})

test('a pause in the capture jumps the timestamp by the pause, marked', async () => {
    const harness = await createPlane('audio')

    pushFrames(harness, START_MS, 10)
    // One second with nothing captured, then the capture carries on.
    pushFrames(harness, START_MS + 10 * FRAME_MS + 1_000, 5)
    const packets = rtpFrom(harness.relay, SELF_AUDIO)

    assert.equal(packets.length, 15)
    assert.equal(steps(packets)[9], FRAME_SAMPLES + 16_000, 'one frame plus the second missed')
    assert.deepEqual(markers(packets), [0, 10], 'the frame after the pause is marked')
    assert.deepEqual(steps(packets).slice(10), [960, 960, 960, 960], 'and the timeline goes on')
    assert.ok(sequential(packets), 'no packet is missing, only time')
    assert.equal(harness.plane.getStats().audioTimelineResyncs, 1)
    harness.plane.stop()
})

test('capture delivered ahead of the clock is shed without moving the timeline', async () => {
    const harness = await createPlane('audio')
    pushFrames(harness, START_MS, 5)

    // Six frames at once, stamped by default: all as captured just before now.
    harness.time.ms = START_MS + 6 * FRAME_MS
    for (let frame = 0; frame < 6; frame++) harness.plane.pushCapture(FRAME)
    // The capture carries on at its own pace.
    harness.time.ms += FRAME_MS
    harness.plane.pushCapture(FRAME)
    const packets = rtpFrom(harness.relay, SELF_AUDIO)
    const stats = harness.plane.getStats()
    // A frame stamped a full slack behind is shed: only two of the burst fit.
    const fitting = SLACK_MS / FRAME_MS

    assert.equal(stats.audioFramesShed, 6 - fitting, 'what does not fit the slack is shed')
    assert.equal(packets.length, 5 + fitting + 1)
    assert.deepEqual(new Set(steps(packets)), new Set([FRAME_SAMPLES]), 'with no gap left behind')
    assert.deepEqual(markers(packets), [0])
    assert.equal(stats.audioCaptureSkewMs, -FRAME_MS, 'the timeline stays one frame ahead')
    harness.plane.stop()
})

test('muting and unmuting keep one continuous timeline', async () => {
    const harness = await createPlane('audio')

    pushFrames(harness, START_MS, 5)
    await harness.plane.apply({ muted: true })
    pushFrames(harness, START_MS + 5 * FRAME_MS, 5)
    await harness.plane.apply({ muted: false })
    pushFrames(harness, START_MS + 10 * FRAME_MS, 5)
    const packets = rtpFrom(harness.relay, SELF_AUDIO)

    assert.equal(packets.length, 15)
    assert.deepEqual(new Set(steps(packets)), new Set([FRAME_SAMPLES]))
    assert.deepEqual(markers(packets), [0])
    harness.plane.stop()
})

/** A plane whose leg comes up before the accept: the caller's warmup. */
async function createWarmPlane(): Promise<Harness> {
    const harness = await createPlane('audio', { accepted: false })
    harness.relay.connected = false
    await harness.plane.apply({ relays: RELAYS })
    assert.equal(harness.plane.isWarmingUp, true)
    return harness
}

test('the warmup and the flow run on one timeline', async () => {
    const harness = await createWarmPlane()

    pushFrames(harness, START_MS, 5)
    await harness.plane.apply({ accepted: true })
    assert.equal(harness.plane.isFlowing, true)
    pushFrames(harness, START_MS + 5 * FRAME_MS, 5)
    const packets = rtpFrom(harness.relay, SELF_AUDIO)

    assert.equal(packets.length, 10)
    assert.equal(
        packets[0].header.timestamp,
        ticksAt(START_MS, AUDIO_CLOCK_RATE),
        'the clock started with the warmup'
    )
    assert.deepEqual(
        new Set(steps(packets)),
        new Set([FRAME_SAMPLES]),
        'the flow did not re-anchor'
    )
    assert.deepEqual(markers(packets), [0])
    harness.plane.stop()
})

test('a partial frame the flow throws away is stepped over exactly', async () => {
    const harness = await createWarmPlane()
    const half = FRAME.subarray(0, FRAME_SAMPLES / 2)

    // Three halves: one frame and a half left in the encoder.
    for (let block = 0; block < 3; block++) {
        harness.time.ms = START_MS + (block + 1) * 30
        harness.plane.pushCapture(half, START_MS + block * 30)
    }
    await harness.plane.apply({ accepted: true })
    pushFrames(harness, START_MS + 90, 2)
    const packets = rtpFrom(harness.relay, SELF_AUDIO)

    assert.equal(packets.length, 3)
    assert.deepEqual(steps(packets), [FRAME_SAMPLES + FRAME_SAMPLES / 2, FRAME_SAMPLES])
    assert.deepEqual(markers(packets), [0, 1], 'the frame after the gap is marked')
    harness.plane.stop()
})

test('a relay outage leaves a gap of exactly the audio it dropped', async () => {
    const harness = await createPlane('audio')
    const half = FRAME.subarray(0, FRAME_SAMPLES / 2)

    pushFrames(harness, START_MS, 10)
    // Half a frame in the encoder as the leg goes down.
    harness.time.ms = START_MS + 10 * FRAME_MS + 30
    harness.plane.pushCapture(half, START_MS + 10 * FRAME_MS)
    harness.relay.connected = false
    pushFrames(harness, START_MS + 10 * FRAME_MS + 30, 7)
    harness.relay.connected = true
    pushFrames(harness, START_MS + 17 * FRAME_MS + 30, 3)
    const packets = rtpFrom(harness.relay, SELF_AUDIO)

    assert.equal(packets.length, 13)
    assert.equal(
        steps(packets)[9],
        FRAME_SAMPLES + FRAME_SAMPLES / 2 + 7 * FRAME_SAMPLES,
        'one frame, the half thrown away and the seven dropped'
    )
    assert.deepEqual(markers(packets), [0, 10])
    assert.ok(sequential(packets))
    const stats = harness.plane.getStats()
    assert.equal(stats.audioDropped, 7)
    assert.equal(stats.audioTimelineResyncs, 0, 'the clock agreed with the count')
    assert.equal(stats.audioCaptureSkewMs, 0)
    harness.plane.stop()
})

test('a frame the encoder fails on is a gap the next frame steps over', async () => {
    const harness = await createPlane('audio')
    harness.codec.failOn.add(3)

    pushFrames(harness, START_MS, 5)
    const packets = rtpFrom(harness.relay, SELF_AUDIO)

    assert.equal(packets.length, 4)
    assert.deepEqual(steps(packets), [960, 1_920, 960])
    assert.deepEqual(markers(packets), [0, 2])
    harness.plane.stop()
})

test('a new audio ssrc anchors its first frame on the clock', async () => {
    const harness = await createPlane('audio')

    pushFrames(harness, START_MS, 5)
    // The stamps drift 50 ms late: inside the slack, so the timeline keeps its count.
    pushFrames(harness, START_MS + 5 * FRAME_MS + 50, 5)
    const before = rtpFrom(harness.relay, SELF_AUDIO)
    assert.deepEqual(new Set(steps(before)), new Set([FRAME_SAMPLES]))

    const newSelfAudio = 0x12121212
    await harness.plane.apply({ ssrcs: { ...SSRCS, selfAudio: newSelfAudio } })
    const captured = START_MS + 10 * FRAME_MS + 50
    pushFrame(harness, captured)
    const [first] = rtpFrom(harness.relay, newSelfAudio)

    assert.equal(first.header.timestamp, ticksAt(captured, AUDIO_CLOCK_RATE))
    assert.equal(first.header.marker, true)
    harness.plane.stop()
})

test('video opened mid-call is stamped on the clock the audio already runs on', async () => {
    const harness = await createPlane('audio')
    pushFrames(harness, START_MS, 40)

    await harness.plane.apply({ video: { send: true, receive: true } })
    const instant = START_MS + 40 * FRAME_MS
    harness.time.ms = instant
    assert.equal(harness.plane.sendVideoFrame(KEY_FRAME, 42_000_000), 1)
    pushFrame(harness, instant)

    const offset = videoMinusAudioMs(
        lastRtpTimestamp(harness.relay, SELF_AUDIO),
        lastRtpTimestamp(harness.relay, SELF_VIDEO)
    )
    assert.ok(Math.abs(offset) <= 1, `video ${offset} ms off the audio captured with it`)
    harness.plane.stop()
})

test('video timestamps only go forward, whatever the host stamps', async () => {
    const harness = await createPlane('video')
    const hostStampsUs = [5_000_000, 5_033_000, 5_033_000, 1_000, 34_000, 34_000]

    for (const stamp of hostStampsUs) {
        harness.time.ms += 10
        assert.equal(harness.plane.sendVideoFrame(KEY_FRAME, stamp), 1)
    }
    const packets = rtpFrom(harness.relay, SELF_VIDEO)

    assert.equal(packets.length, hostStampsUs.length)
    for (const step of steps(packets)) {
        assert.ok(step > 0 && step < 0x80000000, `a step of ${step} is not forward`)
    }
    assert.ok(
        packets.at(-1)!.header.timestamp <= ticksAt(harness.time.ms, VIDEO_CLOCK_RATE) + 1,
        'and never past the instant they were sent'
    )
    harness.plane.stop()
})

/** Stamped with the packet's own timestamp, a report lags by each stream's own delay. */
test('the sender reports of both streams carry the clock at the instant they are assembled', async () => {
    const harness = await createPlane('video')
    harness.internals.audioReportSchedule = SenderReportSchedule.onMediaClock(0, AUDIO_CLOCK_RATE)
    harness.internals.videoReportSchedule = SenderReportSchedule.onWallClock(0)

    for (let frame = 0; frame < 4; frame++) {
        const captured = START_MS + frame * FRAME_MS
        // The audio arrives a frame after its capture, the video 25 ms after.
        harness.time.ms = captured + 25
        harness.plane.sendVideoFrame(KEY_FRAME, frame * FRAME_MS * 1000)
        pushFrame(harness, captured)
    }
    const assembledAt = harness.time.ms
    const [audio] = reportsFrom(harness.relay, SELF_AUDIO).slice(-1)
    const [video] = reportsFrom(harness.relay, SELF_VIDEO).slice(-1)
    assert.ok(audio)
    assert.ok(video)

    const audioReport = readUInt32BE(audio, 16)
    const videoReport = readUInt32BE(video, 16)
    assert.equal(audioReport, ticksAt(assembledAt, AUDIO_CLOCK_RATE))
    assert.equal(
        audioReport - lastRtpTimestamp(harness.relay, SELF_AUDIO),
        FRAME_SAMPLES,
        'the audio report is a frame past the packet, captured a frame earlier'
    )
    // The video report went out 35 ms before the audio one, at its own frame.
    assert.equal(videoReport, ticksAt(assembledAt - 35, VIDEO_CLOCK_RATE))
    assert.ok(Math.abs(videoMinusAudioMs(audioReport, videoReport) + 35) <= 0.1)
    harness.plane.stop()
})
