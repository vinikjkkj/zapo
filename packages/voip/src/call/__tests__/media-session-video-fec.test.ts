import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'

import { writeUInt16BE, writeUInt32BE } from '../../bytes.js'
import { RtpStreamReception } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket } from '../../media/rtp.js'
import {
    CallMediaType,
    type InboundVideoFrame,
    type InboundVideoRtpPacket,
    type WaVoipDeps
} from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

/** SSRC of the peer's H.264, from the capture where the two streams appear together. */
const PEER_VIDEO_SSRC = 0xa8a22c13
/** SSRC on which the same capture carries PT 103 and PT 106, distinct from the video one. */
const PEER_FEC_SSRC = 0x1f3a87d7
const PEER_AUDIO_SSRC = 0x33333333

const H264_PAYLOAD_TYPE = 97
const OPUS_PAYLOAD_TYPE = 120
/**
 * The FEC family inside the 7 bits of the PT field: `103 + 3k`, k from 0 to
 * 8. Only 103 and 106 showed up in capture; the rest is the formula, listed
 * here so a new k does not fall back into the video branch without anyone
 * noticing.
 */
const FEC_PAYLOAD_TYPES = [103, 106, 109, 112, 115, 118, 121, 124, 127]

/** Video clock, the unit of the RTP timestamps below. */
const VIDEO_CLOCK_RATE = 90_000
/** Ticks between two frames at 30 fps, the step of the capture's timestamps. */
const VIDEO_TICKS_PER_FRAME = 3000

/**
 * Parity whose first two bytes used to be discarded as if they were a
 * prefix, leaving a 0x65 that assembly reads as an IDR NAL header. This is
 * the exact shape of the packet that fabricated a keyframe that did not
 * exist.
 */
const FEC_PARITY = new Uint8Array([0xa1, 0xb2, 0x65, 0x88, 0x84, 0x00])
/** A complete IDR NAL, the video payload that has to keep assembling. */
const H264_IDR_PAYLOAD = new Uint8Array([0x65, 0x88, 0x84])

interface SessionInternals {
    srtpSession: { unprotect: (data: Uint8Array) => RtpPacket }
    sctpRelay: {
        broadcast: (data: ArrayBuffer) => void
        hasConnection: () => boolean
        cleanup: () => void
        setSubscriptionSsrc: (ssrc: number) => void
        resendSubscriptions: () => void
    }
    videoReception: RtpStreamReception
    videoRecvPackets: number
    reedSolomonFecPackets: number
    receivedVideoKeyFrame: boolean
    onRelayData: (data: Uint8Array) => void
}

interface FecHarness {
    readonly session: WaCallMediaSession
    readonly frames: InboundVideoFrame[]
    readonly packets: InboundVideoRtpPacket[]
    readonly internals: SessionInternals
}

/**
 * Video session with SRTP pass-through and an inert relay, so that only the
 * routing by payload type and what it feeds are exercised.
 */
function createSession(): FecHarness {
    const frames: InboundVideoFrame[] = []
    const packets: InboundVideoRtpPacket[] = []
    const call = CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', CallMediaType.Video)
    const session = new WaCallMediaSession({
        deps: {} as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: call,
        delegate: {
            emitState: () => {},
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: () => {},
            emitInboundVideoRtp: (_call, packet) => {
                packets.push(packet)
            },
            emitInboundVideo: (_call, frame) => {
                frames.push(frame)
            },
            emitOutboundAudioFinished: () => {}
        } satisfies WaCallMediaSessionDelegate
    })

    const internals = session as unknown as SessionInternals
    internals.sctpRelay = {
        broadcast: () => {},
        hasConnection: () => true,
        cleanup: () => {},
        setSubscriptionSsrc: () => {},
        resendSubscriptions: () => {}
    }
    internals.srtpSession = { unprotect: (data) => RtpPacket.decode(data) }

    return { session, frames, packets, internals }
}

/** An RTP packet as the peer sends it, with marker set to close the frame. */
function inboundPacket(
    payloadType: number,
    ssrc: number,
    payload: Uint8Array,
    sequenceNumber = 1,
    timestamp = VIDEO_TICKS_PER_FRAME
): Uint8Array {
    const header = new RtpHeader(payloadType, sequenceNumber, timestamp, ssrc)
    header.marker = true
    return new RtpPacket(header, payload).encode()
}

/** Video sequences from the sample: five packets, five lost, five packets. */
const VIDEO_SEQUENCES = [100, 101, 102, 103, 104, 110, 111, 112, 113, 114]
/** Packets missing in the middle of it. */
const VIDEO_PACKETS_LOST = 5
/** Packets expected between the first and last sequence received. */
const VIDEO_PACKETS_EXPECTED = VIDEO_SEQUENCES.length + VIDEO_PACKETS_LOST
/** The same loss as a fraction of 256, which is the report block's field. */
const VIDEO_FRACTION_LOST = Math.floor((VIDEO_PACKETS_LOST * 256) / VIDEO_PACKETS_EXPECTED)
/** Sequences of the FEC stream, in a numbering space unrelated to the other. */
const FEC_SEQUENCES = [40_000, 40_001, 40_002, 40_003, 40_004]

test('a reed-solomon fec packet assembles no frame and announces no key frame', () => {
    const harness = createSession()

    harness.internals.onRelayData(inboundPacket(103, PEER_FEC_SSRC, FEC_PARITY))

    assert.equal(harness.frames.length, 0, 'parity bytes are not an access unit')
    assert.equal(harness.packets.length, 0, 'parity must not reach the rtp consumer as video')
    assert.equal(
        harness.internals.receivedVideoKeyFrame,
        false,
        'the third parity byte reads as an idr nal header once the first two are cut off'
    )
    assert.equal(harness.internals.videoRecvPackets, 0, 'the fec stream is not the h.264 stream')
    assert.equal(harness.internals.reedSolomonFecPackets, 1, 'the stream is counted, not silent')
    harness.session.cleanup()
})

test('every payload type of the fec family is discarded, not only the captured ones', () => {
    const harness = createSession()

    for (const payloadType of FEC_PAYLOAD_TYPES) {
        harness.internals.onRelayData(inboundPacket(payloadType, PEER_FEC_SSRC, FEC_PARITY))
    }

    assert.equal(harness.frames.length, 0)
    assert.equal(harness.packets.length, 0)
    assert.equal(harness.internals.receivedVideoKeyFrame, false)
    assert.equal(harness.internals.videoRecvPackets, 0)
    assert.equal(harness.internals.reedSolomonFecPackets, FEC_PAYLOAD_TYPES.length)
    harness.session.cleanup()
})

test('a payload type 97 packet still assembles its frame, whole', () => {
    const harness = createSession()

    harness.internals.onRelayData(
        inboundPacket(H264_PAYLOAD_TYPE, PEER_VIDEO_SSRC, H264_IDR_PAYLOAD)
    )

    assert.equal(harness.frames.length, 1)
    assert.equal(harness.frames[0].keyFrame, true)
    assert.deepEqual(harness.frames[0].data, new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84]))
    assert.equal(harness.packets.length, 1)
    assert.deepEqual(
        harness.packets[0].payload,
        H264_IDR_PAYLOAD,
        'nothing is cut off the h.264 payload'
    )
    assert.equal(harness.internals.videoRecvPackets, 1)
    assert.equal(harness.internals.reedSolomonFecPackets, 0)
    harness.session.cleanup()
})

test('the opus payload type is outside the fec family', () => {
    const harness = createSession()

    harness.internals.onRelayData(
        inboundPacket(OPUS_PAYLOAD_TYPE, PEER_AUDIO_SSRC, new Uint8Array(60).fill(0x42))
    )

    assert.equal(harness.internals.reedSolomonFecPackets, 0, '120 is not 103 + 3k')
    harness.session.cleanup()
})

/**
 * The video report block is what the peer uses to estimate bandwidth. With
 * the FEC stream feeding the same tracker, every packet swapped the tracked
 * SSRC and restarted everything, so the block came out describing a single
 * packet: zero loss, zero jitter, and half the time, the FEC's SSRC in place
 * of the video one's.
 */
test('the video report block describes the video stream only, with its real loss', () => {
    const harness = createSession()

    for (let index = 0; index < VIDEO_SEQUENCES.length; index++) {
        const sequence = VIDEO_SEQUENCES[index]
        harness.internals.onRelayData(
            inboundPacket(
                H264_PAYLOAD_TYPE,
                PEER_VIDEO_SSRC,
                H264_IDR_PAYLOAD,
                sequence,
                sequence * VIDEO_TICKS_PER_FRAME
            )
        )
        const fec = FEC_SEQUENCES[index % FEC_SEQUENCES.length]
        harness.internals.onRelayData(
            inboundPacket(106, PEER_FEC_SSRC, FEC_PARITY, fec, fec * VIDEO_TICKS_PER_FRAME)
        )
    }
    const report = harness.internals.videoReception.report(Date.now())

    assert.equal(report.ssrc, PEER_VIDEO_SSRC, 'the block names the stream it reports on')
    assert.equal(report.highestSequence, VIDEO_SEQUENCES[VIDEO_SEQUENCES.length - 1])
    assert.equal(report.packetsLost, VIDEO_PACKETS_LOST)
    assert.equal(report.fractionLost, VIDEO_FRACTION_LOST)
    assert.equal(harness.internals.videoRecvPackets, VIDEO_SEQUENCES.length)
    assert.equal(harness.internals.reedSolomonFecPackets, VIDEO_SEQUENCES.length)
    harness.session.cleanup()
})

/**
 * Why the separation is mandatory and not tidying up: the tracker is for one
 * stream only and restarts on every SSRC change, so two interleaved streams
 * never accumulate anything. This is the reading that used to go out on the
 * wire before.
 */
test('one reception tracker fed both streams reports no loss and no jitter at all', () => {
    const mixed = new RtpStreamReception(VIDEO_CLOCK_RATE)
    const separated = new RtpStreamReception(VIDEO_CLOCK_RATE)

    for (let index = 0; index < VIDEO_SEQUENCES.length; index++) {
        const sequence = VIDEO_SEQUENCES[index]
        const timestamp = sequence * VIDEO_TICKS_PER_FRAME
        const arrival = index * 33 + (index % 3)
        mixed.observe(PEER_VIDEO_SSRC, sequence, timestamp, arrival)
        separated.observe(PEER_VIDEO_SSRC, sequence, timestamp, arrival)
        const fec = FEC_SEQUENCES[index % FEC_SEQUENCES.length]
        mixed.observe(PEER_FEC_SSRC, fec, fec * VIDEO_TICKS_PER_FRAME, arrival)
    }
    const mixedReport = mixed.report(1_000)
    const mixedSsrc = mixedReport.ssrc
    const mixedLost = mixedReport.packetsLost
    const mixedFraction = mixedReport.fractionLost
    const mixedJitter = mixedReport.jitter
    const separatedReport = separated.report(1_000)

    assert.equal(mixedSsrc, PEER_FEC_SSRC, 'the last arrival owns the block, not the video stream')
    assert.equal(mixedLost, 0, 'five lost video packets were reported as none')
    assert.equal(mixedFraction, 0)
    assert.equal(mixedJitter, 0, 'a restart per packet leaves the jitter estimate untouched')
    assert.equal(separatedReport.ssrc, PEER_VIDEO_SSRC)
    assert.equal(separatedReport.packetsLost, VIDEO_PACKETS_LOST)
    assert.equal(separatedReport.fractionLost, VIDEO_FRACTION_LOST)
    assert.ok((separatedReport.jitter ?? 0) > 0, 'the same arrivals do produce a jitter estimate')
})

/** A minimal sender report from source `ssrc`, with only the NTP pair that gets echoed back. */
function senderReport(ssrc: number): Uint8Array {
    const packet = new Uint8Array(28)
    packet[0] = 0x80
    packet[1] = 200
    writeUInt16BE(packet, 6, 2)
    writeUInt32BE(packet, ssrc, 4)
    writeUInt32BE(packet, 1, 8)
    writeUInt32BE(packet, 0x8000_0000, 12)
    return packet
}

/**
 * The LSR/DLSR pair is the only round-trip sample the peer draws from our
 * reception, and restarting on an SSRC change zeroes both. With the streams
 * interleaved, one FEC packet between the sender report and our report was
 * enough for the peer to never close an RTT.
 */
test('the round-trip probe survives only while one stream owns the tracker', () => {
    const mixed = new RtpStreamReception(VIDEO_CLOCK_RATE)
    const separated = new RtpStreamReception(VIDEO_CLOCK_RATE)

    for (const tracker of [mixed, separated]) {
        tracker.observe(PEER_VIDEO_SSRC, 100, VIDEO_TICKS_PER_FRAME, 0)
        tracker.observeSenderReport(senderReport(PEER_VIDEO_SSRC), 10)
    }
    mixed.observe(PEER_FEC_SSRC, 40_000, VIDEO_TICKS_PER_FRAME, 20)
    separated.observe(PEER_VIDEO_SSRC, 101, 2 * VIDEO_TICKS_PER_FRAME, 20)
    const mixedReport = mixed.report(30)
    const mixedLastSenderReport = mixedReport.lastSenderReport ?? 0
    const mixedDelay = mixedReport.delaySinceLastSenderReport ?? 0
    const separatedReport = separated.report(30)

    assert.equal(mixedLastSenderReport, 0, 'one fec packet wipes the timestamp echoed back')
    assert.equal(mixedDelay, 0, 'and with it the delay the peer needs for its round-trip sample')
    assert.ok((separatedReport.lastSenderReport ?? 0) > 0)
    assert.ok((separatedReport.delaySinceLastSenderReport ?? 0) > 0)
})
