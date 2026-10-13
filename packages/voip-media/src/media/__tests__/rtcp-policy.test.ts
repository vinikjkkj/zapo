import assert from 'node:assert/strict'
import test from 'node:test'

import {
    nextAudioReceiverEstimate,
    nextReceiverMaxBitrate,
    SenderReportSchedule
} from '../rtcp-policy.js'

const AUDIO_CLOCK_RATE = 16_000

/** The interval the session paces both of its streams by, in milliseconds. */
const REPORT_INTERVAL_MS = 1_500
/** Fraction the schedule spreads that interval over, in both directions. */
const REPORT_INTERVAL_JITTER = 0.1
const SHORTEST_INTERVAL_MS = REPORT_INTERVAL_MS * (1 - REPORT_INTERVAL_JITTER)
const LONGEST_INTERVAL_MS = REPORT_INTERVAL_MS * (1 + REPORT_INTERVAL_JITTER)
/** The same interval on the 16 kHz audio clock, which is what it converts into. */
const REPORT_INTERVAL_TICKS = REPORT_INTERVAL_MS * (AUDIO_CLOCK_RATE / 1000)
const SHORTEST_INTERVAL_TICKS = REPORT_INTERVAL_TICKS * (1 - REPORT_INTERVAL_JITTER)
const LONGEST_INTERVAL_TICKS = REPORT_INTERVAL_TICKS * (1 + REPORT_INTERVAL_JITTER)
/** Samples one frame of the capture carried, 60 ms of that same clock. */
const CAPTURED_SAMPLES_PER_PACKET = 960
/** Packets the capture counted between two consecutive sender reports. */
const CAPTURED_PACKETS_PER_REPORT = 25
/** A frame of twice that length, which closes the interval in half the packets. */
const LONG_SAMPLES_PER_PACKET = CAPTURED_SAMPLES_PER_PACKET * 2

/** Packets one randomized interval can take at `samplesPerPacket` a packet. */
function packetBand(samplesPerPacket: number): { readonly fewest: number; readonly most: number } {
    return {
        fewest: Math.ceil(SHORTEST_INTERVAL_TICKS / samplesPerPacket),
        most: Math.ceil(LONGEST_INTERVAL_TICKS / samplesPerPacket)
    }
}

/** Timestamp ticks a media-clock schedule takes to close one interval. */
function ticksToReport(schedule: SenderReportSchedule, step: number, from: number): number {
    let timestamp = from
    schedule.shouldReport(timestamp)
    for (let packets = 1; packets <= 10_000; packets++) {
        timestamp = (timestamp + step) >>> 0
        if (schedule.shouldReport(timestamp)) return packets * step
    }
    return assert.fail('the schedule never closed its interval')
}

/** Milliseconds a wall-clock schedule takes to close one interval from `from`. */
function msToReport(schedule: SenderReportSchedule, from: number): number {
    for (let elapsed = 1; elapsed <= 10_000; elapsed++) {
        if (schedule.shouldReport(from + elapsed)) return elapsed
    }
    return assert.fail('the schedule never closed its interval')
}

test('a schedule opens its interval on the first call instead of closing it', () => {
    const schedule = SenderReportSchedule.onMediaClock(REPORT_INTERVAL_MS, AUDIO_CLOCK_RATE)
    assert.equal(
        schedule.shouldReport(0xdead_beef),
        false,
        'a stream whose timestamp starts anywhere must not report on its first packet'
    )
})

test('a media-clock schedule converts its interval into the ticks of the stream clock', () => {
    const schedule = SenderReportSchedule.onMediaClock(REPORT_INTERVAL_MS, AUDIO_CLOCK_RATE)
    schedule.shouldReport(0)
    assert.equal(REPORT_INTERVAL_TICKS, 24_000, '1500 ms of a 16 kHz clock')
    assert.equal(schedule.shouldReport(21_599), false, 'short of the whole jitter band')
    assert.equal(schedule.shouldReport(26_400), true, 'past the whole jitter band')
})

test('a media-clock schedule of a 90 kHz stream scales with that stream clock', () => {
    const schedule = SenderReportSchedule.onMediaClock(REPORT_INTERVAL_MS, 90_000)
    schedule.shouldReport(0)
    assert.equal(schedule.shouldReport(121_499), false)
    assert.equal(schedule.shouldReport(148_500), true)
})

test('a media-clock schedule reports on the timestamp advance, not on a packet count', () => {
    for (const samplesPerPacket of [320, CAPTURED_SAMPLES_PER_PACKET, LONG_SAMPLES_PER_PACKET]) {
        const schedule = SenderReportSchedule.onMediaClock(REPORT_INTERVAL_MS, AUDIO_CLOCK_RATE)
        const ticks = ticksToReport(schedule, samplesPerPacket, 12_345)
        assert.ok(
            ticks >= REPORT_INTERVAL_TICKS * (1 - REPORT_INTERVAL_JITTER) &&
                ticks < REPORT_INTERVAL_TICKS * (1 + REPORT_INTERVAL_JITTER) + samplesPerPacket,
            `a ${samplesPerPacket}-sample frame closed the interval after ${ticks} ticks`
        )
    }
})

test('the packets one audio interval covers follow the frame length', () => {
    const packetsAt = (samplesPerPacket: number): number =>
        ticksToReport(
            SenderReportSchedule.onMediaClock(REPORT_INTERVAL_MS, AUDIO_CLOCK_RATE),
            samplesPerPacket,
            0
        ) / samplesPerPacket
    assert.equal(
        REPORT_INTERVAL_TICKS / CAPTURED_SAMPLES_PER_PACKET,
        CAPTURED_PACKETS_PER_REPORT,
        'one interval is the 25 packets the capture counted between two reports'
    )
    const capturedBand = packetBand(CAPTURED_SAMPLES_PER_PACKET)
    const defaultFrame = packetsAt(CAPTURED_SAMPLES_PER_PACKET)
    assert.ok(
        defaultFrame >= capturedBand.fewest && defaultFrame <= capturedBand.most,
        `60 ms frames reported after ${defaultFrame}, outside ${capturedBand.fewest} to ${capturedBand.most}`
    )
    const longBand = packetBand(LONG_SAMPLES_PER_PACKET)
    const longFrame = packetsAt(LONG_SAMPLES_PER_PACKET)
    assert.ok(
        longFrame >= longBand.fewest && longFrame <= longBand.most,
        `120 ms frames reported after ${longFrame}, outside ${longBand.fewest} to ${longBand.most}`
    )
    assert.ok(longFrame < capturedBand.fewest, 'a packet count would not follow the frame length')
})

test('an audio schedule survives the RTP timestamp wrapping through zero', () => {
    const schedule = SenderReportSchedule.onMediaClock(REPORT_INTERVAL_MS, AUDIO_CLOCK_RATE)
    schedule.shouldReport(0xffff_ff00)
    assert.equal(schedule.shouldReport(21_343), false, '21599 ticks past the wrap, still short')
    assert.equal(schedule.shouldReport(26_144), true, '26400 ticks past the wrap, past the band')
})

test('a media-clock schedule keeps reporting across a wrap it runs through', () => {
    const schedule = SenderReportSchedule.onMediaClock(REPORT_INTERVAL_MS, AUDIO_CLOCK_RATE)
    let timestamp = 0xffff_ff00 - CAPTURED_SAMPLES_PER_PACKET * 40
    schedule.shouldReport(timestamp)
    let reports = 0
    for (let packet = 0; packet < 400; packet++) {
        timestamp = (timestamp + CAPTURED_SAMPLES_PER_PACKET) >>> 0
        if (schedule.shouldReport(timestamp)) reports++
    }
    const ticks = 400 * CAPTURED_SAMPLES_PER_PACKET
    assert.ok(
        reports >= Math.floor(ticks / LONGEST_INTERVAL_TICKS) &&
            reports <= Math.ceil(ticks / SHORTEST_INTERVAL_TICKS),
        `${reports} reports over ${ticks} ticks spanning the wrap`
    )
})

test('a wall-clock schedule compares milliseconds with no clock conversion', () => {
    const schedule = SenderReportSchedule.onWallClock(REPORT_INTERVAL_MS)
    const start = Date.now()
    schedule.shouldReport(start)
    assert.equal(schedule.shouldReport(start + 1_349), false)
    assert.equal(
        schedule.shouldReport(start + 1_651),
        true,
        'an interval scaled by a media clock would never close here'
    )
})

test('the report interval is randomized inside its band and redrawn per report', () => {
    const schedule = SenderReportSchedule.onWallClock(REPORT_INTERVAL_MS)
    schedule.shouldReport(0)
    const measured = new Set<number>()
    let now = 0
    for (let report = 0; report < 30; report++) {
        const elapsed = msToReport(schedule, now)
        now += elapsed
        measured.add(elapsed)
        assert.ok(
            elapsed >= SHORTEST_INTERVAL_MS && elapsed <= LONGEST_INTERVAL_MS,
            `interval ${elapsed} fell outside the band`
        )
    }
    assert.ok(measured.size > 1, 'a flat interval would hold every participant in lockstep')
})

test('a reset opens a new interval instead of closing the one it dropped', () => {
    const schedule = SenderReportSchedule.onWallClock(REPORT_INTERVAL_MS)
    schedule.shouldReport(1_000)
    schedule.reset()
    assert.equal(schedule.shouldReport(1_000_000), false, 'the first call after a reset only opens')
    assert.equal(schedule.shouldReport(1_001_651), true)
})

/** Floor, ceiling, and initial value the bandwidth rule announces. */
const REMB_MIN_BITRATE = 64_000
const REMB_MAX_BITRATE = 2_000_000
const REMB_INITIAL_BITRATE = 300_000
/** The collapsed rate that motivated this feedback, in bits per second. */
const COLLAPSED_BITRATE = 28_000
/** Duration of one reception window, the same cadence as the sender reports. */
const REMB_WINDOW_MS = 1_500

/** Octets that produce `bitsPerSecond` in a window of `elapsedMs`. */
function octetsFor(bitsPerSecond: number, elapsedMs: number): number {
    return (bitsPerSecond * elapsedMs) / (8 * 1000)
}

test('announces an initial ceiling before any interval has closed', () => {
    assert.equal(nextReceiverMaxBitrate(0, 0, 0, 0), REMB_INITIAL_BITRATE)
    assert.equal(nextReceiverMaxBitrate(0, 100_000, REMB_WINDOW_MS, 40), REMB_INITIAL_BITRATE)
    assert.ok(
        REMB_INITIAL_BITRATE > COLLAPSED_BITRATE * 2,
        'the first announcement already clears the collapsed rate'
    )
})

/**
 * The announced value becomes the sender estimator's ceiling, so a rule that
 * returned the received rate would lock the call where it already is: we
 * receive 28 kbps because the sender is stuck, we announce 28 kbps, its
 * ceiling becomes 28 kbps. This test locks in the property that breaks that
 * loop.
 */
test('announces more than the rate arriving, so the sender has somewhere to climb', () => {
    const collapsed = octetsFor(COLLAPSED_BITRATE, REMB_WINDOW_MS)
    let ceiling = REMB_INITIAL_BITRATE
    for (let interval = 0; interval < 8; interval++) {
        const next = nextReceiverMaxBitrate(ceiling, collapsed, REMB_WINDOW_MS, 0)
        assert.ok(next > COLLAPSED_BITRATE, `interval ${interval} announced ${next}`)
        assert.ok(next >= ceiling, 'a healthy interval never lowers the ceiling')
        ceiling = next
    }
    assert.equal(ceiling, REMB_MAX_BITRATE, 'the ceiling reaches the cap while the peer is stuck')
})

test('grows the ceiling from the previous one, not from what the peer used', () => {
    const idle = nextReceiverMaxBitrate(400_000, 0, REMB_WINDOW_MS, 0)
    const trickle = nextReceiverMaxBitrate(
        400_000,
        octetsFor(COLLAPSED_BITRATE, REMB_WINDOW_MS),
        REMB_WINDOW_MS,
        0
    )

    assert.equal(idle, 600_000, 'a window the peer barely used still raises the ceiling')
    assert.equal(trickle, idle, 'what arrived does not hold the ceiling down')
})

test('lets a peer that overshoots the ceiling pull it up', () => {
    const octets = octetsFor(800_000, REMB_WINDOW_MS)
    assert.equal(nextReceiverMaxBitrate(100_000, octets, REMB_WINDOW_MS, 0), 1_200_000)
})

test('holds the ceiling on intermediate loss instead of anchoring it to the rate', () => {
    const octets = octetsFor(COLLAPSED_BITRATE, REMB_WINDOW_MS)
    const held = nextReceiverMaxBitrate(500_000, octets, REMB_WINDOW_MS, 5)

    assert.equal(held, 500_000, 'holding the measured rate would be the lock')
    assert.ok(held > COLLAPSED_BITRATE)
})

test('backs the ceiling off under loss, down to the floor at worst', () => {
    const octets = octetsFor(200_000, REMB_WINDOW_MS)
    const backed = nextReceiverMaxBitrate(500_000, octets, REMB_WINDOW_MS, 25)
    assert.equal(backed, 170_000, 'the lower of the ceiling and the measured rate, stepped down')

    const collapsed = octetsFor(COLLAPSED_BITRATE, REMB_WINDOW_MS)
    const bottom = nextReceiverMaxBitrate(REMB_MIN_BITRATE, collapsed, REMB_WINDOW_MS, 90)
    assert.equal(bottom, REMB_MIN_BITRATE, 'the floor holds above the collapsed rate')
    assert.ok(REMB_MIN_BITRATE > COLLAPSED_BITRATE)
})

test('keeps the announced ceiling inside the floor and the cap', () => {
    const octets = octetsFor(REMB_MAX_BITRATE, REMB_WINDOW_MS)
    assert.equal(
        nextReceiverMaxBitrate(REMB_MAX_BITRATE, octets, REMB_WINDOW_MS, 0),
        REMB_MAX_BITRATE
    )
    assert.equal(nextReceiverMaxBitrate(10_000, 0, REMB_WINDOW_MS, 0), REMB_MIN_BITRATE)
    assert.equal(nextReceiverMaxBitrate(100_000, 0, 0, 0), 150_000, 'an unmeasurable window grows')
})

/** UAQC thresholds of the audio `<voip_settings>` the estimate is placed against. */
const UAQC_PROBING_REMB_THRESHOLD = 22_000
const UAQC_BANDWIDTH_MANAGED_REMB_UPPER = 24_000
const UAQC_HIGH_QUALITY_TARGET = 25_000
/** Floor and ceiling of the audio estimate. */
const AUDIO_REMB_MIN_BITRATE = 16_000
const AUDIO_REMB_MAX_BITRATE = 30_000
const AUDIO_REMB_INITIAL_BITRATE = 24_000

test('the audio estimate opens above the bitrate UAQC needs to leave probing', () => {
    assert.equal(nextAudioReceiverEstimate(0, 0), AUDIO_REMB_INITIAL_BITRATE)
    assert.equal(nextAudioReceiverEstimate(0, 50), AUDIO_REMB_INITIAL_BITRATE)
    assert.ok(AUDIO_REMB_INITIAL_BITRATE >= UAQC_PROBING_REMB_THRESHOLD)
})

test('the audio estimate climbs 10% per clean interval and settles on its ceiling', () => {
    assert.equal(nextAudioReceiverEstimate(AUDIO_REMB_INITIAL_BITRATE, 0), 26_400)
    assert.equal(nextAudioReceiverEstimate(26_400, 1.9), 29_040)

    let estimate = nextAudioReceiverEstimate(0, 0)
    for (let interval = 0; interval < 20; interval++) {
        const next = nextAudioReceiverEstimate(estimate, 0)
        assert.ok(next >= estimate, 'a clean interval never lowers it')
        estimate = next
    }
    assert.equal(estimate, AUDIO_REMB_MAX_BITRATE)
    assert.equal(nextAudioReceiverEstimate(estimate, 0), estimate, 'no trend once settled')
})

test('one backoff from the ceiling stays above the high-quality target and managed band', () => {
    const backedOff = nextAudioReceiverEstimate(AUDIO_REMB_MAX_BITRATE, 10)
    assert.ok(backedOff > UAQC_HIGH_QUALITY_TARGET)
    assert.ok(backedOff > UAQC_BANDWIDTH_MANAGED_REMB_UPPER)
    assert.ok(
        nextAudioReceiverEstimate(backedOff, 10) < UAQC_BANDWIDTH_MANAGED_REMB_UPPER,
        'a second lossy interval does reach the managed band'
    )
})

test('the audio estimate holds on intermediate loss and backs off from 10%', () => {
    assert.equal(nextAudioReceiverEstimate(30_000, 2), 30_000)
    assert.equal(nextAudioReceiverEstimate(30_000, 9.9), 30_000)
    assert.equal(nextAudioReceiverEstimate(30_000, 10), 25_500)
    assert.equal(nextAudioReceiverEstimate(30_000, 40), 25_500)
})

test('the audio estimate never drops below 16 kbps however heavy the loss', () => {
    let estimate = AUDIO_REMB_MAX_BITRATE
    for (let interval = 0; interval < 30; interval++) {
        estimate = nextAudioReceiverEstimate(estimate, 90)
        assert.ok(estimate >= AUDIO_REMB_MIN_BITRATE)
    }
    assert.equal(estimate, AUDIO_REMB_MIN_BITRATE)
})
