import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { readUInt32BE } from '../../bytes.js'
import { createNoopLogger } from '../../logger.js'
import { type MLowCodec } from '../../media/mlow-codec.js'
import { type RtpStreamReception, SenderReportSchedule } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket, RtpSession } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const SELF_AUDIO_SSRC = 0x11111111
const SELF_VIDEO_SSRC = 0x22222222
const PEER_AUDIO_SSRC = 0x33333333
const PEER_VIDEO_SSRC = 0x44444444
/** SSRC of the FEC stream, which the capture shows separate from the video one. */
const PEER_FEC_SSRC = 0x55555555

/** The audio call's `rc.rtcp_interval_ms`, handed to the plane in its settings. */
const REPORT_INTERVAL_MS = 1_500
/**
 * Interval long enough that a burst of synchronous, allocation-only calls can
 * never cross its randomized threshold on its own, even on a loaded CI
 * machine. `REPORT_INTERVAL_MS` is deliberately not used for that: its
 * threshold sits only 10% above the wall-clock time such a burst takes to
 * run, which the burst tests below have observed crossing on a slow runner.
 */
const BURST_SAFE_INTERVAL_MS = 300_000
/** Fraction the plane spreads that interval over, in both directions. */
const REPORT_INTERVAL_JITTER = 0.1
/** Clock rate of the audio stream, the unit its interval converts into. */
const AUDIO_CLOCK_RATE = 16_000
/** The interval on that clock, which is what the audio schedule compares against. */
const REPORT_INTERVAL_TICKS = REPORT_INTERVAL_MS * (AUDIO_CLOCK_RATE / 1000)
/**
 * Samples one opus packet covers without a codec to ask: the plane's fallback
 * and the 60 ms frame length the capture ran at.
 */
const AUDIO_SAMPLES_PER_PACKET = 960
/** Packets the capture counted between two consecutive sender reports. */
const CAPTURED_PACKETS_PER_REPORT = 25
/** A frame of twice that length, which closes the interval in half the packets. */
const LONG_SAMPLES_PER_PACKET = AUDIO_SAMPLES_PER_PACKET * 2
/** Microseconds between the video frames fed in, one packet each. */
const VIDEO_FRAME_INTERVAL_US = 40_000
/** The same interval on the 90 kHz video clock. */
const VIDEO_TICKS_PER_FRAME = 3600
/** Where the plane's time source starts; the call's media clock counts from here. */
const CLOCK_START_MS = 1_000_000

const SR_SSRC_OFFSET = 4
const SR_RTP_TIMESTAMP_OFFSET = 16
const SR_PACKET_COUNT_OFFSET = 20
const SR_OCTET_COUNT_OFFSET = 24
const SR_REPORT_BLOCK_OFFSET = 28
/** The WhatsApp video profile bit, in byte 0 of the sender report. */
const VIDEO_PROFILE_BIT = 0x10
/** Mask of the report block count: four bits under the profile, five without it. */
const VIDEO_REPORT_COUNT_MASK = 0x0f
const REPORT_COUNT_MASK = 0x1f

const OPUS_FRAME = new Uint8Array(60).fill(0x42)
/** One Annex-B IDR access unit, small enough to packetize into a single payload. */
const VIDEO_FRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00])
/** The payload size the video send path packetizes against. */
const VIDEO_MAX_PAYLOAD = 800

interface PlaneInternals {
    videoStreamOpen: boolean
    rtpSession: RtpSession
    videoRtpSession: RtpSession
    codec: MLowCodec
    srtpSession: {
        protect: (packet: RtpPacket) => Uint8Array
        unprotect: (data: Uint8Array) => RtpPacket
    }
    srtcpContext: { protect: (rtcp: Uint8Array, senderSsrc: number) => Uint8Array }
    sctpRelay: {
        broadcast: (data: ArrayBuffer) => void
        hasConnection: () => boolean
        cleanup: () => void
        setSubscriptionSsrc: (ssrc: number) => void
        resendSubscriptions: () => void
    }
    audioReception: RtpStreamReception
    videoReception: RtpStreamReception
    videoReportSchedule: SenderReportSchedule
    receiverEstimateSchedule: SenderReportSchedule
    wallSendTimeExtension: boolean
    onRelayData: (data: Uint8Array) => void
}

interface RtcpHarness {
    readonly plane: WaCallMediaPlane
    readonly sent: Uint8Array[]
    readonly internals: PlaneInternals
    /** The plane's time source, which the senders below move as they feed media. */
    readonly time: { ms: number }
    /** Frames fed so far, so each one carries its own capture timestamp. */
    videoFrames: number
}

/**
 * A plane whose relay collects what it would broadcast and whose SRTP layers
 * are pass-through, so the RTP and RTCP packets can be read as built. Its time
 * source is moved by hand.
 *
 * Video reports are paced by elapsed time, so the harness installs a schedule
 * of `videoReportIntervalMs`, zero by default: every frame past the one that
 * opened the interval then reports, which makes the video path drivable without
 * waiting out a real interval. Pass the real interval to exercise the pacing.
 * The receiver estimate runs on the same cadence off the receive path, so it
 * takes the same interval.
 */
async function createPlane(
    mediaType: 'audio' | 'video',
    videoReportIntervalMs = 0
): Promise<RtcpHarness> {
    const sent: Uint8Array[] = []
    const time = { ms: CLOCK_START_MS }
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        onInboundVideoRtp: () => {},
        onInboundVideo: () => {},
        now: () => time.ms
    })
    await plane.apply({ mediaType })
    if (mediaType === 'audio') {
        // An audio call carries the server's interval, as the captured one did.
        await plane.apply({
            settings: {
                rtcpIntervalMs: REPORT_INTERVAL_MS,
                disableRtcpRemb: false,
                appDataSframe: false
            }
        })
    }

    const internals = plane as unknown as PlaneInternals
    internals.sctpRelay = {
        broadcast: (data) => {
            sent.push(new Uint8Array(data))
        },
        hasConnection: () => true,
        cleanup: () => {},
        setSubscriptionSsrc: () => {},
        resendSubscriptions: () => {}
    }
    internals.srtpSession = {
        protect: (packet) => packet.encode(),
        unprotect: (data) => RtpPacket.decode(data)
    }
    internals.srtcpContext = { protect: (rtcp) => rtcp }
    internals.rtpSession = RtpSession.whatsappOpus(SELF_AUDIO_SSRC)
    internals.codec = fixedFrameCodec(AUDIO_SAMPLES_PER_PACKET)
    if (mediaType === 'video') {
        internals.videoRtpSession = new RtpSession(SELF_VIDEO_SSRC, 97)
        internals.videoReportSchedule = SenderReportSchedule.onWallClock(videoReportIntervalMs)
        internals.receiverEstimateSchedule = SenderReportSchedule.onWallClock(videoReportIntervalMs)
    }
    // Media goes out only once it flows: the call accepted, with a leg up.
    await plane.apply({ accepted: true })
    // A stream already running: video is open.
    internals.videoStreamOpen = true

    return { plane, sent, internals, time, videoFrames: 0 }
}

/** A codec that frames at `samplesPerPacket` and encodes every frame as `OPUS_FRAME`. */
function fixedFrameCodec(samplesPerPacket: number): MLowCodec {
    return {
        getFrameSize: () => samplesPerPacket,
        encode: () => OPUS_FRAME,
        resetSequence: () => {},
        getStats: () => ({ success: 0, errors: 0 }),
        destroy: () => {}
    } as unknown as MLowCodec
}

/** Pushes one codec frame right after the last, moving the time source by its length. */
function sendAudioFrame(harness: RtcpHarness): void {
    const samples = harness.internals.codec.getFrameSize()
    const capturedAt = harness.time.ms
    harness.time.ms += (samples * 1000) / AUDIO_CLOCK_RATE
    harness.plane.pushCapture(new Float32Array(samples), capturedAt)
}

/** An Annex-B access unit long enough to need several RTP packets. */
function longVideoFrame(payloadBytes: number): Uint8Array {
    const frame = new Uint8Array(5 + payloadBytes)
    frame.set([0, 0, 0, 1, 0x65])
    frame.fill(0x2a, 5)
    return frame
}

/** Packets one randomized interval can take at `samplesPerPacket` a packet. */
function packetBand(samplesPerPacket: number): { readonly fewest: number; readonly most: number } {
    return {
        fewest: Math.ceil(
            (REPORT_INTERVAL_TICKS * (1 - REPORT_INTERVAL_JITTER)) / samplesPerPacket
        ),
        most: Math.ceil((REPORT_INTERVAL_TICKS * (1 + REPORT_INTERVAL_JITTER)) / samplesPerPacket)
    }
}

/** The sender reports among everything the relay was handed. */
function senderReports(sent: readonly Uint8Array[]): Uint8Array[] {
    return sent.filter((packet) => packet[1] === 200)
}

/** The sender reports of one stream, in the order they went out. */
function reportsFrom(sent: readonly Uint8Array[], ssrc: number): Uint8Array[] {
    return senderReports(sent).filter((report) => readUInt32BE(report, SR_SSRC_OFFSET) === ssrc)
}

/**
 * Sends audio packets until the next report of that stream goes out, and
 * answers how many it took. The interval is randomized and counted in stream
 * time, so a test that needs a report drives the stream to one rather than
 * counting to a fixed number. The first call also spends the packet that opens
 * the interval.
 */
function sendAudioUntilReport(harness: RtcpHarness): number {
    const before = reportsFrom(harness.sent, SELF_AUDIO_SSRC).length
    for (let packets = 1; packets <= 200; packets++) {
        sendAudioFrame(harness)
        if (reportsFrom(harness.sent, SELF_AUDIO_SSRC).length > before) return packets
    }
    return assert.fail('no audio sender report after 200 packets')
}

/** Feeds one video frame captured now, returns its packet count and moves time to the next. */
function sendVideoFrame(harness: RtcpHarness, frame: Uint8Array = VIDEO_FRAME): number {
    const packets = harness.plane.sendVideoFrame(
        frame,
        harness.videoFrames * VIDEO_FRAME_INTERVAL_US
    )
    harness.videoFrames++
    harness.time.ms += VIDEO_FRAME_INTERVAL_US / 1000
    return packets
}

/** The timestamp of the last RTP packet of `ssrc` the relay took before `packet`. */
function rtpTimestampBefore(sent: readonly Uint8Array[], packet: Uint8Array, ssrc: number): number {
    for (let index = sent.indexOf(packet) - 1; index >= 0; index--) {
        const data = sent[index]
        if ((data[1] < 200 || data[1] > 207) && readUInt32BE(data, 8) === ssrc) {
            return readUInt32BE(data, 4)
        }
    }
    return assert.fail('no rtp packet went out before the report')
}

/** Feeds video frames until the next report of that stream goes out. */
function sendVideoUntilReport(harness: RtcpHarness): number {
    const before = reportsFrom(harness.sent, SELF_VIDEO_SSRC).length
    for (let frames = 1; frames <= 200; frames++) {
        assert.equal(sendVideoFrame(harness), 1, 'the fixture frame must be one RTP packet')
        if (reportsFrom(harness.sent, SELF_VIDEO_SSRC).length > before) return frames
    }
    return assert.fail('no video sender report after 200 frames')
}

/** Modular difference of two RTP timestamps, which wrap inside 32 bits. */
function timestampDelta(later: Uint8Array, earlier: Uint8Array): number {
    return (
        (readUInt32BE(later, SR_RTP_TIMESTAMP_OFFSET) -
            readUInt32BE(earlier, SR_RTP_TIMESTAMP_OFFSET)) >>>
        0
    )
}

/** An inbound video RTP packet as the peer would send it. */
function inboundVideoPacket(payloadType: number, ssrc: number, sequenceNumber: number): Uint8Array {
    const header = new RtpHeader(payloadType, sequenceNumber, 90_000, ssrc)
    header.marker = true
    return new RtpPacket(header, new Uint8Array([0x65, 0x88, 0x84])).encode()
}

test('an audio call emits a sender report from its audio send path', async () => {
    const harness = await createPlane('audio')

    sendAudioUntilReport(harness)
    const reports = senderReports(harness.sent)

    assert.equal(reports.length, 1, 'an audio-only call must report, not only a video one')
    assert.equal(readUInt32BE(reports[0], SR_SSRC_OFFSET), SELF_AUDIO_SSRC)
    harness.plane.stop()
})

test('an audio sender report follows the advance of the stream timestamp', async () => {
    const harness = await createPlane('audio')
    const band = packetBand(AUDIO_SAMPLES_PER_PACKET)
    assert.equal(
        REPORT_INTERVAL_TICKS / AUDIO_SAMPLES_PER_PACKET,
        CAPTURED_PACKETS_PER_REPORT,
        'one interval is the 25 packets the capture counted between two reports'
    )

    sendAudioUntilReport(harness)
    const intervals = [
        sendAudioUntilReport(harness),
        sendAudioUntilReport(harness),
        sendAudioUntilReport(harness)
    ]

    for (const packets of intervals) {
        assert.ok(
            packets >= band.fewest && packets <= band.most,
            `reported after ${packets} packets, outside ${band.fewest} to ${band.most}`
        )
    }
    const reports = reportsFrom(harness.sent, SELF_AUDIO_SSRC)
    for (let index = 1; index < reports.length; index++) {
        assert.equal(
            timestampDelta(reports[index], reports[index - 1]),
            intervals[index - 1] * AUDIO_SAMPLES_PER_PACKET,
            'the packets of an interval are exactly the timestamp it advanced by'
        )
    }
    harness.plane.stop()
})

test('a longer audio frame closes the same interval in fewer packets', async () => {
    const harness = await createPlane('audio')
    harness.internals.codec = fixedFrameCodec(LONG_SAMPLES_PER_PACKET)
    const band = packetBand(LONG_SAMPLES_PER_PACKET)

    sendAudioUntilReport(harness)
    const packets = sendAudioUntilReport(harness)

    assert.ok(
        packets >= band.fewest && packets <= band.most,
        `reported after ${packets} packets, outside ${band.fewest} to ${band.most}`
    )
    assert.ok(
        packets < packetBand(AUDIO_SAMPLES_PER_PACKET).fewest,
        'a packet count would have reported after the same number of packets'
    )
    harness.plane.stop()
})

test('the audio sender report counts its own packets and octets', async () => {
    const harness = await createPlane('audio')

    const first = sendAudioUntilReport(harness)
    const second = first + sendAudioUntilReport(harness)
    const [one, two] = reportsFrom(harness.sent, SELF_AUDIO_SSRC)

    assert.equal(readUInt32BE(one, SR_PACKET_COUNT_OFFSET), first)
    assert.equal(readUInt32BE(one, SR_OCTET_COUNT_OFFSET), first * OPUS_FRAME.length)
    assert.equal(readUInt32BE(two, SR_PACKET_COUNT_OFFSET), second)
    assert.equal(readUInt32BE(two, SR_OCTET_COUNT_OFFSET), second * OPUS_FRAME.length)
    harness.plane.stop()
})

test('the audio sender report carries the timestamp of the audio stream itself', async () => {
    const harness = await createPlane('audio')

    sendAudioUntilReport(harness)
    const packets = sendAudioUntilReport(harness)
    const [first, second] = reportsFrom(harness.sent, SELF_AUDIO_SSRC)

    assert.equal(
        timestampDelta(second, first),
        packets * AUDIO_SAMPLES_PER_PACKET,
        'the report advances on the audio clock, not on elapsed wall time'
    )
    assert.equal(
        (readUInt32BE(second, SR_RTP_TIMESTAMP_OFFSET) -
            rtpTimestampBefore(harness.sent, second, SELF_AUDIO_SSRC)) >>>
            0,
        AUDIO_SAMPLES_PER_PACKET,
        'carried forward to the instant it was assembled, a frame after that frame was captured'
    )
    harness.plane.stop()
})

test('a video call reports its audio and video streams apart', async () => {
    const harness = await createPlane('video')

    const audioPackets = sendAudioUntilReport(harness)
    const videoFrames = sendVideoUntilReport(harness)
    const [audio] = reportsFrom(harness.sent, SELF_AUDIO_SSRC)
    const [video] = reportsFrom(harness.sent, SELF_VIDEO_SSRC)

    assert.ok(audio, 'the audio stream of a video call reports too')
    assert.ok(video)
    assert.equal(readUInt32BE(audio, SR_PACKET_COUNT_OFFSET), audioPackets)
    assert.equal(readUInt32BE(video, SR_PACKET_COUNT_OFFSET), videoFrames)
    assert.equal(
        readUInt32BE(video, SR_OCTET_COUNT_OFFSET),
        videoFrames * (VIDEO_FRAME.length - 4),
        'the video counters cover the video payloads only'
    )
    harness.plane.stop()
})

test('each stream reports on its own clock', async () => {
    const harness = await createPlane('video')

    sendAudioUntilReport(harness)
    const audioPackets = sendAudioUntilReport(harness)
    sendVideoUntilReport(harness)
    const videoFrames = sendVideoUntilReport(harness)
    const audio = reportsFrom(harness.sent, SELF_AUDIO_SSRC)
    const video = reportsFrom(harness.sent, SELF_VIDEO_SSRC)

    assert.equal(timestampDelta(audio[1], audio[0]), audioPackets * AUDIO_SAMPLES_PER_PACKET)
    assert.equal(timestampDelta(video[1], video[0]), videoFrames * VIDEO_TICKS_PER_FRAME)
    assert.equal(
        readUInt32BE(video[0], SR_RTP_TIMESTAMP_OFFSET),
        rtpTimestampBefore(harness.sent, video[0], SELF_VIDEO_SSRC),
        'assembled the instant its frame was captured, the report carries that frame timestamp'
    )
    harness.plane.stop()
})

test('a burst of video frames inside one interval reports once at most', async () => {
    const harness = await createPlane('video', BURST_SAFE_INTERVAL_MS)

    for (let frame = 0; frame < 120; frame++) {
        assert.equal(sendVideoFrame(harness), 1)
    }

    assert.equal(
        reportsFrom(harness.sent, SELF_VIDEO_SSRC).length,
        0,
        'a packet count of 25 would have reported four times over inside one interval'
    )
    harness.plane.stop()
})

test('a video sender report follows the frame, not the packets it took', async () => {
    const harness = await createPlane('video')
    const frame = longVideoFrame(VIDEO_MAX_PAYLOAD * 3)

    const packetsPerFrame = sendVideoFrame(harness, frame)
    assert.ok(packetsPerFrame > 1, 'the fixture frame must span several RTP packets')
    assert.equal(sendVideoFrame(harness, frame), packetsPerFrame)
    const reports = reportsFrom(harness.sent, SELF_VIDEO_SSRC)

    assert.equal(reports.length, 1, 'one frame past the opening one is one report')
    assert.equal(readUInt32BE(reports[0], SR_PACKET_COUNT_OFFSET), packetsPerFrame * 2)
    harness.plane.stop()
})

test('each sender report block describes the inbound stream of its own sender', async () => {
    const harness = await createPlane('video')

    harness.internals.audioReception.observe(PEER_AUDIO_SSRC, 700, 1_000, 0)
    harness.internals.videoReception.observe(PEER_VIDEO_SSRC, 9, 90_000, 0)
    sendAudioUntilReport(harness)
    sendVideoUntilReport(harness)
    const [audio] = reportsFrom(harness.sent, SELF_AUDIO_SSRC)
    const [video] = reportsFrom(harness.sent, SELF_VIDEO_SSRC)
    assert.ok(audio)
    assert.ok(video)

    assert.equal(readUInt32BE(audio, SR_REPORT_BLOCK_OFFSET), PEER_AUDIO_SSRC)
    assert.equal(readUInt32BE(audio, SR_REPORT_BLOCK_OFFSET + 8) & 0xffff, 700)
    assert.equal(readUInt32BE(video, SR_REPORT_BLOCK_OFFSET), PEER_VIDEO_SSRC)
    assert.equal(
        readUInt32BE(video, SR_REPORT_BLOCK_OFFSET + 8) & 0xffff,
        9,
        'the audio sequence numbers must not leak into the video block'
    )
    harness.plane.stop()
})

/**
 * The video/audio distinction is born here, in the send path, not inside the
 * builder: both streams go through the same `sendSenderReport`, and only the
 * caller knows which of the two the report is for. The official client marks
 * the video one with the profile bit - 76 sender reports at 0x91 in a
 * capture of 105 SRTCP packets - and the audio one was never observed with
 * it.
 */
test('a video call marks its video sender report and leaves the audio one canonical', async () => {
    const harness = await createPlane('video')

    sendAudioUntilReport(harness)
    sendVideoUntilReport(harness)
    const [audio] = reportsFrom(harness.sent, SELF_AUDIO_SSRC)
    const [video] = reportsFrom(harness.sent, SELF_VIDEO_SSRC)
    assert.ok(audio)
    assert.ok(video)

    assert.equal(video[0], 0x91)
    assert.equal(video[0] & VIDEO_PROFILE_BIT, VIDEO_PROFILE_BIT, 'the video report is marked')
    assert.equal(video[0] & VIDEO_REPORT_COUNT_MASK, 1, 'one block under the profile bit')
    assert.equal(audio[0], 0x81)
    assert.equal(audio[0] & VIDEO_PROFILE_BIT, 0, 'the audio report is not marked')
    assert.equal(audio[0] & REPORT_COUNT_MASK, 1, 'and counts the same one block')
    harness.plane.stop()
})

/**
 * Payload type 103 belongs to Reed-Solomon FEC, which arrives on its own
 * SSRC with its own numbering: it is not the video stream and must not take
 * over its report block, on pain of the block describing a source the peer
 * is not sending.
 */
test('a peer fec stream does not take over the report block of the video stream', async () => {
    const harness = await createPlane('video')

    harness.internals.onRelayData(inboundVideoPacket(97, PEER_VIDEO_SSRC, 5))
    harness.internals.onRelayData(inboundVideoPacket(103, PEER_FEC_SSRC, 41_000))
    sendVideoUntilReport(harness)
    const [video] = reportsFrom(harness.sent, SELF_VIDEO_SSRC)

    assert.equal(readUInt32BE(video, SR_REPORT_BLOCK_OFFSET), PEER_VIDEO_SSRC)
    assert.equal(readUInt32BE(video, SR_REPORT_BLOCK_OFFSET + 8) & 0xffff, 5)
    harness.plane.stop()
})

test('a peer video stream sent as payload type 97 is identified in the report block', async () => {
    const harness = await createPlane('video')

    harness.internals.onRelayData(inboundVideoPacket(97, PEER_VIDEO_SSRC, 11))
    sendVideoUntilReport(harness)
    const [video] = reportsFrom(harness.sent, SELF_VIDEO_SSRC)

    assert.equal(readUInt32BE(video, SR_REPORT_BLOCK_OFFSET), PEER_VIDEO_SSRC)
    assert.equal(readUInt32BE(video, SR_REPORT_BLOCK_OFFSET + 8) & 0xffff, 11)
    harness.plane.stop()
})

/** Byte 0 of a REMB: plain FMT 15, without the profile bit the sender report carries. */
const REMB_FIRST_BYTE = 0x8f
/** Where the count-plus-bandwidth word and the listed SSRC sit in a REMB. */
const REMB_BAND_OFFSET = 16
const REMB_SSRC_OFFSET = 20
/** The collapsed rate that motivated this feedback, in bits per second. */
const COLLAPSED_BITRATE = 28_000

/** The REMB packets among everything the relay received, which FMT 15 separates from the PLI and the FIR. */
function receiverEstimates(sent: readonly Uint8Array[]): Uint8Array[] {
    return sent.filter((packet) => packet[1] === 206 && (packet[0] & 0x1f) === 15)
}

/** The bandwidth a REMB announces, which is `mantissa << exponent`. */
function rembBitrate(packet: Uint8Array): number {
    const band = readUInt32BE(packet, REMB_BAND_OFFSET) & 0xffffff
    return (band & 0x3ffff) * 2 ** (band >>> 18)
}

/**
 * The video sender report only comes out of the send path, so a call where
 * we receive video without sending any would leave this end hanging. The
 * REMB must not inherit that defect: that is what the experiment measures,
 * because the sender estimator's ceiling comes precisely from it.
 */
test('a call that only receives video still emits a receiver estimate', async () => {
    const harness = await createPlane('video')

    harness.internals.onRelayData(inboundVideoPacket(97, PEER_VIDEO_SSRC, 1))
    harness.internals.onRelayData(inboundVideoPacket(97, PEER_VIDEO_SSRC, 2))
    const estimates = receiverEstimates(harness.sent)

    assert.equal(harness.videoFrames, 0, 'no video was sent')
    assert.equal(
        reportsFrom(harness.sent, SELF_VIDEO_SSRC).length,
        0,
        'the video sender report needs the send path, which never ran'
    )
    assert.equal(estimates.length, 1, 'the receiver estimate went out anyway')
    assert.equal(estimates[0][0], REMB_FIRST_BYTE)
    assert.equal(estimates[0][1], 206)
    assert.equal(estimates[0].length, 24)
    assert.equal(readUInt32BE(estimates[0], 4), SELF_VIDEO_SSRC, 'sent as our own video stream')
    assert.equal(readUInt32BE(estimates[0], 8), 0, 'the header media ssrc stays zero')
    assert.deepEqual(estimates[0].subarray(12, 16), new Uint8Array([0x52, 0x45, 0x4d, 0x42]))
    assert.equal(estimates[0][REMB_BAND_OFFSET], 1)
    assert.equal(
        readUInt32BE(estimates[0], REMB_SSRC_OFFSET),
        PEER_VIDEO_SSRC,
        'the FCI names the peer video ssrc the packets actually carried'
    )
    harness.plane.stop()
})

test('the receiver estimate climbs while the call only receives', async () => {
    const harness = await createPlane('video')

    for (let sequence = 1; sequence <= 4; sequence++) {
        harness.internals.onRelayData(inboundVideoPacket(97, PEER_VIDEO_SSRC, sequence))
    }
    const bitrates = receiverEstimates(harness.sent).map(rembBitrate)

    assert.equal(bitrates.length, 3)
    for (let index = 1; index < bitrates.length; index++) {
        assert.ok(
            bitrates[index] > bitrates[index - 1],
            `estimate ${index} (${bitrates[index]}) must climb past the previous one (${bitrates[index - 1]})`
        )
    }
    for (const bitrate of bitrates) {
        assert.ok(bitrate > COLLAPSED_BITRATE, 'announcing the arriving rate would be the lock')
    }
    harness.plane.stop()
})

test('a burst of inbound video inside one interval estimates once at most', async () => {
    const harness = await createPlane('video', BURST_SAFE_INTERVAL_MS)

    for (let sequence = 1; sequence <= 120; sequence++) {
        harness.internals.onRelayData(inboundVideoPacket(97, PEER_VIDEO_SSRC, sequence))
    }

    assert.equal(
        receiverEstimates(harness.sent).length,
        0,
        'the estimate is paced by the same interval as the sender reports'
    )
    harness.plane.stop()
})

test('the peer fec stream does not drive the receiver estimate', async () => {
    const harness = await createPlane('video')

    for (let sequence = 41_000; sequence < 41_010; sequence++) {
        harness.internals.onRelayData(inboundVideoPacket(103, PEER_FEC_SSRC, sequence))
    }

    assert.equal(
        receiverEstimates(harness.sent).length,
        0,
        'only the video stream opens and closes the estimate window'
    )
    harness.plane.stop()
})

/** RTP packets the relay took for `ssrc`, decoded. */
function rtpPacketsFrom(sent: readonly Uint8Array[], ssrc: number): RtpPacket[] {
    return sent
        .filter((data) => data.length >= 12 && (data[1] < 200 || data[1] > 207))
        .map((data) => RtpPacket.decode(data))
        .filter((packet) => packet.header.ssrc === ssrc)
}

/** The data of one-byte element `id` in an RFC 8285 block, or null. */
function extensionElement(data: Uint8Array, id: number): Uint8Array | null {
    for (let index = 0; index < data.length; ) {
        const head = data[index]
        if (head === 0) {
            index++
            continue
        }
        const length = (head & 0x0f) + 1
        if (head >> 4 === id) return data.subarray(index + 1, index + 1 + length)
        index += 1 + length
    }
    return null
}

/** WhatsApp Web's id 9: wall ms / 16, 12 bits. */
function wallSendTime16(nowMs: number): number {
    return Math.floor(nowMs / 16) & 0x0fff
}

test('with the send-time extension, audio and video carry id 9 as the wall clock on one clock', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_790_888_642_787 })
    const video = await createPlane('video')
    const audio = await createPlane('audio')
    video.internals.wallSendTimeExtension = true
    audio.internals.wallSendTimeExtension = true

    sendVideoFrame(video)
    sendAudioFrame(audio)

    const expected = wallSendTime16(Date.now())
    const [videoPacket] = rtpPacketsFrom(video.sent, SELF_VIDEO_SSRC)
    const [audioPacket] = rtpPacketsFrom(audio.sent, SELF_AUDIO_SSRC)
    assert.deepEqual(
        [...(extensionElement(videoPacket.header.extensionData, 9) ?? [])],
        [expected >> 8, expected & 0xff]
    )
    assert.deepEqual(
        [...audioPacket.header.extensionData],
        [0x91, expected >> 8, expected & 0xff, 0]
    )

    t.mock.timers.tick(1_600)
    sendVideoFrame(video)
    const later = rtpPacketsFrom(video.sent, SELF_VIDEO_SSRC).at(-1)
    const id9 = extensionElement(later!.header.extensionData, 9)!
    assert.equal(((id9[0] << 8) | id9[1]) - expected, 100, '1.6 s is 100 units of 16 ms')
    video.plane.stop()
    audio.plane.stop()
})

test('without it, the video id 9 is the transport sequence and the audio carries no element', async () => {
    const video = await createPlane('video')
    const audio = await createPlane('audio')

    sendVideoFrame(video)
    sendVideoFrame(video)
    sendAudioFrame(audio)

    const [first, second] = rtpPacketsFrom(video.sent, SELF_VIDEO_SSRC).map((packet) => {
        const id9 = extensionElement(packet.header.extensionData, 9)!
        return (id9[0] << 8) | id9[1]
    })
    assert.equal(second - first, 1)
    assert.equal(rtpPacketsFrom(audio.sent, SELF_AUDIO_SSRC)[0].header.extensionData.length, 0)
    video.plane.stop()
    audio.plane.stop()
})
