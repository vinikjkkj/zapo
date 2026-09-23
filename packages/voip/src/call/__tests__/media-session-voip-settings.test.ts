import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createNoopLogger } from 'zapo-js'
import type { BinaryNode } from 'zapo-js/transport'

import { bytesToBase64, readUInt32BE, TEXT_ENCODER } from '../../bytes.js'
import { SenderReportSchedule } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket, RtpSession } from '../../media/rtp.js'
import { parseVoipSettings } from '../../signaling/voip-settings.js'
import { CallMediaType, type WaVoipDeps } from '../../types.js'
import { CallInfo } from '../call-state.js'
import { WaCallMediaSession, type WaCallMediaSessionDelegate } from '../WaCallMediaSession.js'

const ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'

const SELF_AUDIO_SSRC = 0x11111111
const SELF_VIDEO_SSRC = 0x22222222
const PEER_VIDEO_SSRC = 0x33333333

const VIDEO_CLOCK_RATE = 90_000
const AUDIO_CLOCK_RATE = 16_000

/** Compiled interval, what applies when the offer does not carry the parameter. */
const DEFAULT_INTERVAL_MS = 1_500
/** Interval the server sends in the test, short enough to be visible. */
const SERVER_INTERVAL_MS = 120
/** Band the schedule draws each interval from, in both directions. */
const REPORT_INTERVAL_JITTER = 0.1
/** Samples of one opus packet, the size the send path assumes. */
const AUDIO_SAMPLES_PER_PACKET = 960
/** Where the count-plus-bandwidth word sits in a REMB. */
const REMB_BAND_OFFSET = 16
/**
 * Upper bound no receiver estimate in this file should ever cross: a
 * regression that emits the collapsed floor or a runaway value both stay far
 * outside it, while every legitimate estimate this suite produces sits well
 * under it.
 */
const REMB_SANE_UPPER_BOUND = 10_000_000

const OPUS_FRAME = new Uint8Array(60).fill(0x42)

interface SessionInternals {
    rtpSession: RtpSession
    videoRtpSession: RtpSession
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
    receiverEstimateSchedule: SenderReportSchedule
    sendOpusFrame: (frame: Uint8Array, isSilence: boolean) => void
    onRelayData: (data: Uint8Array) => void
}

interface Harness {
    readonly session: WaCallMediaSession
    readonly sent: Uint8Array[]
    readonly internals: SessionInternals
}

/** The offer as it arrives, with the config in base64 in the server node. */
function offerWith(settings: unknown): BinaryNode {
    return {
        tag: 'call',
        attrs: { from: 'peer@lid', id: 'STANZAID' },
        content: [
            {
                tag: 'offer',
                attrs: { 'call-id': ID },
                content: [
                    {
                        tag: 'voip_settings',
                        attrs: { uncompressed: '1' },
                        content: bytesToBase64(TEXT_ENCODER.encode(JSON.stringify(settings)))
                    }
                ]
            }
        ]
    }
}

/**
 * A session whose relay collects what would be transmitted and whose SRTP
 * layers are pass-through, so the packets can be read as they were built.
 *
 * `settings` is applied before the REMB schedule is swapped in, so the gate
 * tests get a deterministic zero-millisecond cadence: every packet past the
 * one that opens the interval would emit a REMB, if the gate let it. The
 * interval test does not use this swap, precisely because it is the schedule
 * that it measures.
 */
function createSession(
    mediaType: CallMediaType,
    settings?: unknown,
    overrideEstimateSchedule = true
): Harness {
    const sent: Uint8Array[] = []
    const session = new WaCallMediaSession({
        deps: {} as unknown as WaVoipDeps,
        logger: createNoopLogger(),
        info: CallInfo.newOutgoing(ID, 'peer@lid', 'me@lid', mediaType),
        delegate: {
            emitState: () => {},
            emitIncoming: () => {},
            emitEnded: () => {},
            emitInboundAudio: () => {},
            emitInboundVideoRtp: () => {},
            emitInboundVideo: () => {},
            emitOutboundAudioFinished: () => {}
        } satisfies WaCallMediaSessionDelegate
    })

    if (settings !== undefined) {
        session.applyVoipSettings(parseVoipSettings(offerWith(settings)))
    }

    const internals = session as unknown as SessionInternals
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
    if (mediaType === CallMediaType.Video) {
        internals.videoRtpSession = new RtpSession(SELF_VIDEO_SSRC, 97, VIDEO_CLOCK_RATE, 3000)
        if (overrideEstimateSchedule) {
            internals.receiverEstimateSchedule = SenderReportSchedule.onWallClock(0)
        }
    }

    return { session, sent, internals }
}

/** A video packet from the peer, as it would arrive from the relay. */
function inboundVideoPacket(sequenceNumber: number): Uint8Array {
    const header = new RtpHeader(97, sequenceNumber, VIDEO_CLOCK_RATE, PEER_VIDEO_SSRC)
    header.marker = true
    return new RtpPacket(header, new Uint8Array([0x65, 0x88, 0x84])).encode()
}

/** The REMB packets among everything the relay received, which FMT 15 separates from the rest. */
function receiverEstimates(sent: readonly Uint8Array[]): Uint8Array[] {
    return sent.filter((packet) => packet[1] === 206 && (packet[0] & 0x1f) === 15)
}

/** The sender reports among everything the relay received. */
function senderReports(sent: readonly Uint8Array[]): Uint8Array[] {
    return sent.filter((packet) => packet[1] === 200)
}

/** The bandwidth a REMB announces, which is `mantissa << exponent`. */
function rembBitrate(packet: Uint8Array): number {
    const band = readUInt32BE(packet, REMB_BAND_OFFSET) & 0xffffff
    return (band & 0x3ffff) * 2 ** (band >>> 18)
}

/** Audio packets sent until the first sender report goes out. */
function audioPacketsUntilReport(harness: Harness): number {
    for (let packets = 1; packets <= 200; packets++) {
        harness.internals.sendOpusFrame(OPUS_FRAME, false)
        if (senderReports(harness.sent).length > 0) return packets
    }
    return assert.fail('no audio sender report after 200 packets')
}

/**
 * Packets a schedule of `intervalMs` can take until the first sender report.
 * The interval is drawn from within a band, and the first packet opens the
 * interval instead of closing it, so it counts.
 */
function firstReportBand(intervalMs: number): { readonly fewest: number; readonly most: number } {
    const ticks = intervalMs * (AUDIO_CLOCK_RATE / 1000)
    return {
        fewest: 1 + Math.ceil((ticks * (1 - REPORT_INTERVAL_JITTER)) / AUDIO_SAMPLES_PER_PACKET),
        most: 1 + Math.ceil((ticks * (1 + REPORT_INTERVAL_JITTER)) / AUDIO_SAMPLES_PER_PACKET)
    }
}

/**
 * REMB was implemented and started going out every interval while the
 * server had already turned that transport off in the offer itself: the
 * packet came out correct and the peer did not process it. This is the
 * measured cost of not reading the node.
 */
test('disable_rtcp_remb stops the receiver estimate from leaving the session', () => {
    const harness = createSession(CallMediaType.Video, { vid_rc: { disable_rtcp_remb: '1' } })

    for (let sequence = 1; sequence <= 6; sequence++) {
        harness.internals.onRelayData(inboundVideoPacket(sequence))
    }

    assert.equal(receiverEstimates(harness.sent).length, 0)
    assert.equal(harness.sent.length, 0, 'nothing else took its place either')
    harness.session.cleanup()
})

test('the receiver estimate still goes out when the gate is absent or off', () => {
    const noGate = createSession(CallMediaType.Video, { vid_rc: { minbwe: '35000' } })
    const gateOff = createSession(CallMediaType.Video, { vid_rc: { disable_rtcp_remb: '0' } })
    const noSettings = createSession(CallMediaType.Video)

    for (const harness of [noGate, gateOff, noSettings]) {
        for (let sequence = 1; sequence <= 3; sequence++) {
            harness.internals.onRelayData(inboundVideoPacket(sequence))
        }
        const estimates = receiverEstimates(harness.sent)
        assert.equal(estimates.length, 2)
        for (const estimate of estimates) {
            const bitrate = rembBitrate(estimate)
            assert.ok(
                bitrate > 0 && bitrate < REMB_SANE_UPPER_BOUND,
                `expected a non-zero bounded estimate, got ${bitrate}`
            )
        }
        harness.session.cleanup()
    }
})

test('a settings payload that cannot be read leaves the remb exactly as it was', () => {
    const broken: BinaryNode = {
        tag: 'call',
        attrs: { from: 'peer@lid', id: 'STANZAID' },
        content: [
            {
                tag: 'offer',
                attrs: { 'call-id': ID },
                content: [{ tag: 'voip_settings', attrs: { uncompressed: '1' }, content: '####' }]
            }
        ]
    }
    const harness = createSession(CallMediaType.Video)
    harness.session.applyVoipSettings(parseVoipSettings(broken))

    harness.internals.onRelayData(inboundVideoPacket(1))
    harness.internals.onRelayData(inboundVideoPacket(2))

    assert.equal(receiverEstimates(harness.sent).length, 1)
    harness.session.cleanup()
})

test('the rtcp interval the server hands down replaces the compiled one', () => {
    const served = createSession(
        CallMediaType.Audio,
        { rc: { rtcp_interval_ms: String(SERVER_INTERVAL_MS) } },
        false
    )
    const compiled = createSession(CallMediaType.Audio, undefined, false)

    const servedPackets = audioPacketsUntilReport(served)
    const servedBand = firstReportBand(SERVER_INTERVAL_MS)
    const compiledBand = firstReportBand(DEFAULT_INTERVAL_MS)

    assert.ok(
        servedPackets >= servedBand.fewest && servedPackets <= servedBand.most,
        `reported after ${servedPackets}, outside ${servedBand.fewest} to ${servedBand.most}`
    )
    assert.ok(
        servedPackets < compiledBand.fewest,
        'the compiled interval would have needed many more packets'
    )

    for (let packets = 0; packets < servedPackets; packets++) {
        compiled.internals.sendOpusFrame(OPUS_FRAME, false)
    }
    assert.equal(
        senderReports(compiled.sent).length,
        0,
        'the same packets report nothing on the compiled interval'
    )

    served.session.cleanup()
    compiled.session.cleanup()
})

test('an interval the server did not send leaves the compiled cadence alone', () => {
    const harness = createSession(CallMediaType.Audio, { vid_rc: { minbwe: '35000' } }, false)
    const band = firstReportBand(DEFAULT_INTERVAL_MS)

    const packets = audioPacketsUntilReport(harness)

    assert.ok(
        packets >= band.fewest && packets <= band.most,
        `reported after ${packets} packets, outside ${band.fewest} to ${band.most}`
    )
    harness.session.cleanup()
})
