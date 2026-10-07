import assert from 'node:assert/strict'
import { test } from 'node:test'

import { HostCaptureTimeMapper, MEDIA_CLOCK_ORIGIN_LEAD_MS, WaMediaClock } from '../WaMediaClock.js'

const AUDIO_CLOCK_RATE = 16_000
const VIDEO_CLOCK_RATE = 90_000
/** One tick of the video clock, the step the plane asks of its mapper. */
const VIDEO_TICK_MS = 1000 / VIDEO_CLOCK_RATE

/** A clock on a time source the test moves by hand. */
function manualClock(startMs: number): { readonly clock: WaMediaClock; time: { ms: number } } {
    const time = { ms: startMs }
    return { clock: new WaMediaClock(() => time.ms), time }
}

test('ticks count from the origin, the lead before the start, at each stream rate', () => {
    const { clock } = manualClock(0)
    clock.start(10_000)

    assert.equal(clock.ticksAt(10_000, AUDIO_CLOCK_RATE), MEDIA_CLOCK_ORIGIN_LEAD_MS * 16)
    assert.equal(clock.ticksAt(10_060, AUDIO_CLOCK_RATE), (MEDIA_CLOCK_ORIGIN_LEAD_MS + 60) * 16)
    assert.equal(clock.ticksAt(10_000, VIDEO_CLOCK_RATE), MEDIA_CLOCK_ORIGIN_LEAD_MS * 90)
    assert.equal(clock.ticksAt(10_040, VIDEO_CLOCK_RATE), (MEDIA_CLOCK_ORIGIN_LEAD_MS + 40) * 90)
    assert.equal(
        clock.ticksAt(10_000.03, AUDIO_CLOCK_RATE),
        MEDIA_CLOCK_ORIGIN_LEAD_MS * 16,
        'a fraction of a tick rounds to the nearest one'
    )
    assert.equal(
        clock.ticksAt(10_000 - MEDIA_CLOCK_ORIGIN_LEAD_MS - 500, AUDIO_CLOCK_RATE),
        0,
        'an instant before the origin is tick zero'
    )
})

test('an instant on both streams is the same time on each stream clock', () => {
    const { clock } = manualClock(0)
    clock.start(3_000)

    for (const instant of [3_000, 3_017.5, 4_250, 3_603_000]) {
        const audioMs = (clock.ticksAt(instant, AUDIO_CLOCK_RATE) * 1000) / AUDIO_CLOCK_RATE
        const videoMs = (clock.ticksAt(instant, VIDEO_CLOCK_RATE) * 1000) / VIDEO_CLOCK_RATE
        assert.ok(Math.abs(audioMs - videoMs) < 0.1, `${audioMs} against ${videoMs}`)
    }
})

test('the timestamp is the unsigned 32-bit field the header carries', () => {
    const { clock } = manualClock(0)
    clock.start(0)
    // 14 hours at 90 kHz is past 2^32 ticks.
    const instant = 14 * 3_600_000

    const ticks = clock.ticksAt(instant, VIDEO_CLOCK_RATE)

    assert.ok(ticks >= 0 && ticks <= 0xffffffff)
    assert.equal(ticks, ((instant + MEDIA_CLOCK_ORIGIN_LEAD_MS) * 90) % 2 ** 32)
})

test('only the first start fixes the origin', () => {
    const { clock, time } = manualClock(5_000)

    clock.start()
    const first = clock.ticksAt(5_000, AUDIO_CLOCK_RATE)
    time.ms = 9_000
    clock.start()
    clock.start(1_000)

    assert.equal(clock.isStarted, true)
    assert.equal(first, MEDIA_CLOCK_ORIGIN_LEAD_MS * 16, 'started at the time source')
    assert.equal(clock.ticksAt(5_000, AUDIO_CLOCK_RATE), first, 'later starts move nothing')
})

test('a clock asked before it started starts at that moment', () => {
    const { clock } = manualClock(2_000)

    assert.equal(clock.isStarted, false)
    assert.equal(clock.ticksAt(2_000, AUDIO_CLOCK_RATE), MEDIA_CLOCK_ORIGIN_LEAD_MS * 16)
    assert.equal(clock.isStarted, true)
})

test('the mapper learns a host epoch of its own from the first frame', () => {
    const mapper = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    // A host counting from its own boot, nowhere near our time source.
    const hostEpochMs = 5_000_000_000
    let now = 1_000

    assert.equal(mapper.map(hostEpochMs, now), now, 'the first frame is taken as captured now')
    for (let frame = 1; frame <= 30; frame++) {
        now += 33
        assert.equal(mapper.map(hostEpochMs + frame * 33, now), now)
    }
})

test('the mapper keeps the host capture spacing when frames arrive with jitter', () => {
    const mapper = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    mapper.map(0, 500)

    // Captured 40 ms apart, delivered late by a latency that wanders.
    const latencies = [12, 3, 25, 9, 30]
    for (let frame = 1; frame <= latencies.length; frame++) {
        const captured = frame * 40
        assert.equal(mapper.map(captured, 500 + captured + latencies[frame - 1]), 500 + captured)
    }
})

test('the mapper never stamps a frame in the future and settles on the least latency', () => {
    const mapper = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    // Captured every 33 ms from 1_000, delivered after unseen latency; the first is slowest.
    const latencies = [80, 52, 34, 51, 20, 45]
    let instant = 0
    for (let frame = 0; frame < latencies.length; frame++) {
        const captured = 1_000 + frame * 33
        const now = captured + latencies[frame]
        instant = mapper.map(frame * 33, now)
        assert.ok(instant <= now, `frame ${frame} stamped at ${instant}, after ${now}`)
        assert.ok(instant >= captured, `frame ${frame} stamped before its capture`)
    }

    assert.equal(instant, 1_000 + 5 * 33 + 20, 'off by the least latency seen, and no more')
})

/** Frames at 30 per second, the pace of the drift runs below. */
const FRAME_MS = 1000 / 30
/** An hour of them. */
const FRAMES_PER_HOUR = 3_600 * 30

interface DriftRun {
    /** Largest `now` minus mapped instant over the run. */
    readonly worstLagMs: number
    /** Whether every instant came after the one before it. */
    readonly increasing: boolean
    /** Whether no instant landed past the moment it was mapped. */
    readonly neverAhead: boolean
    /** Largest gap between a step of the instants and the host's own step. */
    readonly worstStepErrorMs: number
}

/** An hour of frames from a host clock at `rate` times ours, delivered 8 to 20 ms late. */
function runHostClock(rate: number): DriftRun {
    const mapper = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    let worstLagMs = 0
    let worstStepErrorMs = 0
    let increasing = true
    let neverAhead = true
    let lastInstant = -Infinity
    let lastHost = 0
    for (let frame = 0; frame <= FRAMES_PER_HOUR; frame++) {
        const captured = 1_000 + frame * FRAME_MS
        const now = captured + 8 + ((frame * 7) % 13)
        const host = 5_000_000 + captured * rate
        const instant = mapper.map(host, now)
        if (instant <= lastInstant) increasing = false
        if (instant > now) neverAhead = false
        worstLagMs = Math.max(worstLagMs, now - instant)
        if (frame > 0) {
            const stepError = Math.abs(instant - lastInstant - (host - lastHost))
            worstStepErrorMs = Math.max(worstStepErrorMs, stepError)
        }
        lastInstant = instant
        lastHost = host
    }
    return { worstLagMs, increasing, neverAhead, worstStepErrorMs }
}

/** At 100 ppm slow, a fixed offset would leave the video 0.36 s behind after an hour. */
test('the mapper follows a host clock running slow, and the video lag stays bounded', () => {
    const run = runHostClock(1 - 100e-6)

    assert.ok(run.worstLagMs < 50, `the video fell ${run.worstLagMs} ms behind`)
    assert.ok(run.increasing)
    assert.ok(run.neverAhead)
    // Catch-up adds at most 0.5% of a delivery gap (46 ms max here): under 0.25 ms a frame.
    assert.ok(
        run.worstStepErrorMs < 0.25,
        `a step ${run.worstStepErrorMs} ms off the host's: the catch-up is no jump`
    )
})

test('the mapper follows a host clock running fast', () => {
    for (const rate of [1 + 100e-6, 1 + 1_000e-6]) {
        const run = runHostClock(rate)

        assert.ok(run.worstLagMs < 50, `${rate}: the video fell ${run.worstLagMs} ms behind`)
        assert.ok(run.increasing, `${rate}`)
        assert.ok(run.neverAhead, `${rate}`)
    }
})

test('one frame delivered late does not move the offset', () => {
    const steady = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    const spiked = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    const spikeAt = 300

    for (let frame = 0; frame < 600; frame++) {
        const captured = 1_000 + frame * FRAME_MS
        const host = frame * FRAME_MS
        const expected = steady.map(host, captured + 10)
        const late = frame === spikeAt ? 200 : 10
        const instant = spiked.map(host, captured + late)
        if (frame !== spikeAt) {
            assert.equal(instant, expected, `frame ${frame} mapped elsewhere after the spike`)
        }
    }
})

test('a late or reordered stamp neither moves the offset nor breaks the order', () => {
    const steady = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    const reordered = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    const staleAt = 300
    let staleInstant = 0

    for (let frame = 0; frame < 600; frame++) {
        const captured = 1_000 + frame * FRAME_MS
        const host = frame * FRAME_MS
        const now = captured + 8 + ((frame * 7) % 13)
        const expected = steady.map(host, now)
        const instant = reordered.map(host, now)
        assert.equal(instant, expected, `frame ${frame} mapped elsewhere after the stale stamp`)
        if (frame === staleAt) {
            staleInstant = reordered.map(host - 2 * FRAME_MS, now)
            assert.ok(staleInstant > instant, 'the stale stamp still comes after the frame before')
        } else if (frame === staleAt + 1) {
            assert.ok(instant > staleInstant, 'and before the frame after')
        }
    }
})

test('the mapper stays strictly increasing when the host clock goes back', () => {
    const mapper = new HostCaptureTimeMapper(VIDEO_TICK_MS)
    const instants = [
        mapper.map(10_000, 200),
        mapper.map(10_033, 233),
        // A restarted encoder, counting from zero again.
        mapper.map(0, 266),
        mapper.map(33, 299),
        // The same stamp twice.
        mapper.map(33, 299),
        // Back again, at the very instant of the frame before.
        mapper.map(5, 299)
    ]

    for (let index = 1; index < instants.length; index++) {
        assert.ok(
            instants[index] > instants[index - 1],
            `instant ${index} (${instants[index]}) after ${instants[index - 1]}`
        )
    }
    assert.equal(instants[2], 266, 'the new epoch is learned at now')
    assert.ok(
        Math.round(instants[5] * 90) > Math.round(instants[4] * 90),
        'one tick apart at least, on the clock they feed'
    )
})
