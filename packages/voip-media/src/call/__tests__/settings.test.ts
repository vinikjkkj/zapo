import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { readUInt32BE } from '../../bytes.js'
import { createNoopLogger } from '../../logger.js'
import { type MLowCodec } from '../../media/mlow-codec.js'
import { SenderReportSchedule } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket, RtpSession } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { WaCallMediaSettings } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const SELF_AUDIO_SSRC = 0x11111111
const SELF_VIDEO_SSRC = 0x22222222
const PEER_VIDEO_SSRC = 0x33333333

const VIDEO_CLOCK_RATE = 90_000
const AUDIO_CLOCK_RATE = 16_000

/** Compiled interval, what applies when the offer does not carry the parameter. */
const DEFAULT_INTERVAL_MS = 1_000
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
/** One codec frame of capture, 60 ms at 16 kHz. */
const CAPTURE_FRAME = new Float32Array(AUDIO_SAMPLES_PER_PACKET)
const FRAME_MS = (AUDIO_SAMPLES_PER_PACKET * 1000) / AUDIO_CLOCK_RATE

/**
 * What signaling resolves from a `<voip_settings>` that carries none of the keys
 * the media reads: an absent key is its default.
 */
const NO_MEDIA_KEYS: WaCallMediaSettings = {
    rtcpIntervalMs: null,
    disableRtcpRemb: false,
    appDataSframe: false
}

interface PlaneInternals {
    rtpSession: RtpSession
    videoRtpSession: RtpSession
    codec: MLowCodec
    srtpSession: {
        protect: (packet: RtpPacket) => Uint8Array
        unprotect: (data: Uint8Array) => RtpPacket
    }
    srtcpContext: { protect: (rtcp: Uint8Array, senderSsrc: number) => Uint8Array }
    sctpRelay: {
        setMediaFlowing: () => void
        sendMedia: (data: ArrayBuffer) => void
        hasConnection: () => boolean
        cleanup: () => void
        setSubscriptionSsrc: (ssrc: number) => void
        resendSubscriptions: () => void
    }
    receiverEstimateSchedule: SenderReportSchedule
    onRelayData: (data: Uint8Array) => void
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly sent: Uint8Array[]
    readonly internals: PlaneInternals
    /** The plane's time source, moved by hand as audio is fed. */
    readonly time: { ms: number }
}

/**
 * A plane whose relay collects what would be transmitted and whose SRTP
 * layers are pass-through, so the packets can be read as they were built. It
 * runs accepted, on a time source moved by hand.
 *
 * `settings` is applied before the REMB schedule is swapped in, so the gate
 * tests get a deterministic zero-millisecond cadence: every packet past the
 * one that opens the interval would emit a REMB, if the gate let it. The
 * interval test does not use this swap, precisely because it is the schedule
 * that it measures.
 */
async function createPlane(
    mediaType: 'audio' | 'video',
    settings?: WaCallMediaSettings | null,
    overrideEstimateSchedule = true
): Promise<Harness> {
    const sent: Uint8Array[] = []
    const time = { ms: 1_000_000 }
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        now: () => time.ms
    })

    await plane.apply(settings === undefined ? { mediaType } : { mediaType, settings })

    const internals = plane as unknown as PlaneInternals
    internals.sctpRelay = {
        setMediaFlowing: () => {},
        sendMedia: (data) => {
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
    internals.codec = {
        getFrameSize: () => AUDIO_SAMPLES_PER_PACKET,
        encode: () => OPUS_FRAME,
        resetSequence: () => {},
        getStats: () => ({ success: 0, errors: 0 }),
        destroy: () => {}
    } as unknown as MLowCodec
    if (mediaType === 'video') {
        internals.videoRtpSession = new RtpSession(SELF_VIDEO_SSRC, 97)
        if (overrideEstimateSchedule) {
            internals.receiverEstimateSchedule = SenderReportSchedule.onWallClock(0)
        }
    }
    await plane.apply({ accepted: true })

    return { plane, sent, internals, time }
}

/** Pushes one codec frame of capture, back to back with the one before. */
function sendAudioFrame(harness: Harness): void {
    const capturedAt = harness.time.ms
    harness.time.ms += FRAME_MS
    harness.plane.pushCapture(CAPTURE_FRAME, capturedAt)
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
        sendAudioFrame(harness)
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
test('disable_rtcp_remb stops the receiver estimate from leaving the plane', async () => {
    // `{ vid_rc: { disable_rtcp_remb: '1' } }`
    const harness = await createPlane('video', { ...NO_MEDIA_KEYS, disableRtcpRemb: true })

    for (let sequence = 1; sequence <= 6; sequence++) {
        harness.internals.onRelayData(inboundVideoPacket(sequence))
    }

    assert.equal(receiverEstimates(harness.sent).length, 0)
    assert.equal(harness.sent.length, 0, 'nothing else took its place either')
    harness.plane.stop()
})

test('the receiver estimate still goes out when the gate is absent or off', async () => {
    // `{ vid_rc: { minbwe: '35000' } }`: the key is absent, so it resolves to its default.
    const noGate = await createPlane('video', NO_MEDIA_KEYS)
    // `{ vid_rc: { disable_rtcp_remb: '0' } }`
    const gateOff = await createPlane('video', { ...NO_MEDIA_KEYS, disableRtcpRemb: false })
    const noSettings = await createPlane('video')

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
        harness.plane.stop()
    }
})

test('a settings payload that cannot be read leaves the remb exactly as it was', async () => {
    const harness = await createPlane('video')
    // A `<voip_settings>` whose content is `####` resolves to no settings at all.
    await harness.plane.apply({ settings: null })

    harness.internals.onRelayData(inboundVideoPacket(1))
    harness.internals.onRelayData(inboundVideoPacket(2))

    assert.equal(receiverEstimates(harness.sent).length, 1)
    harness.plane.stop()
})

test('the rtcp interval the server hands down replaces the compiled one', async () => {
    // `{ rc: { rtcp_interval_ms: '120' } }`
    const served = await createPlane(
        'audio',
        { ...NO_MEDIA_KEYS, rtcpIntervalMs: SERVER_INTERVAL_MS },
        false
    )
    const compiled = await createPlane('audio', undefined, false)

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
        sendAudioFrame(compiled)
    }
    assert.equal(
        senderReports(compiled.sent).length,
        0,
        'the same packets report nothing on the compiled interval'
    )

    served.plane.stop()
    compiled.plane.stop()
})

/** The audio profile carries `rc.rtcp_interval_ms`; the video profile of an upgrade does not. */
test('a later section without the interval goes back to the compiled one', async () => {
    const harness = await createPlane(
        'audio',
        { ...NO_MEDIA_KEYS, rtcpIntervalMs: SERVER_INTERVAL_MS },
        false
    )
    await harness.plane.apply({ settings: NO_MEDIA_KEYS })
    const band = firstReportBand(DEFAULT_INTERVAL_MS)

    const packets = audioPacketsUntilReport(harness)

    assert.ok(
        packets >= band.fewest && packets <= band.most,
        `reported after ${packets} packets, outside ${band.fewest} to ${band.most}`
    )
    harness.plane.stop()
})

test('an interval the server did not send leaves the compiled cadence alone', async () => {
    // `{ vid_rc: { minbwe: '35000' } }`: no `rc.rtcp_interval_ms`, so the interval is `null`.
    const harness = await createPlane('audio', NO_MEDIA_KEYS, false)
    const band = firstReportBand(DEFAULT_INTERVAL_MS)

    const packets = audioPacketsUntilReport(harness)

    assert.ok(
        packets >= band.fewest && packets <= band.most,
        `reported after ${packets} packets, outside ${band.fewest} to ${band.most}`
    )
    harness.plane.stop()
})
