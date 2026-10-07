import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { DEFAULT_AUDIO_CONFIG } from '../../types.js'
import { WaAudioEngine } from '../WaAudioEngine.js'

const SAMPLE_RATE = DEFAULT_AUDIO_CONFIG.sampleRate
const CHUNK = DEFAULT_AUDIO_CONFIG.captureChunkSize
const CHUNK_MS = (CHUNK / SAMPLE_RATE) * 1000
const TICK_MS = DEFAULT_AUDIO_CONFIG.intervalMs
/** The most chunks one tick may make up for, as the engine caps it. */
const CATCH_UP_CAP = 4
/** What Windows turns a 60 ms interval into: four of its 15.6 ms timer slices. */
const WINDOWS_TICK_MS = 62.5

interface FakeClock {
    readonly now: () => number
    /**
     * Fires the engine's timers due within `timerMs` after moving its clock by
     * `elapsedMs`, which a timer that fires late makes longer than `timerMs`.
     */
    tick(timerMs: number, elapsedMs?: number): void
}

function createClock(t: TestContext): FakeClock {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    let nowMs = 10_000
    return {
        now: () => nowMs,
        tick(timerMs, elapsedMs = timerMs) {
            nowMs += elapsedMs
            t.mock.timers.tick(timerMs)
        }
    }
}

interface CapturedChunk {
    readonly capturedAtMs: number
    readonly samples: Float32Array
}

/** Records every chunk handed over. The engine reuses its buffer, so the samples are copied. */
function recordCapture(engine: WaAudioEngine): CapturedChunk[] {
    const chunks: CapturedChunk[] = []
    engine.setAudioSender({
        sendCapturedAudio: (data, capturedAtMs) => {
            // A missing stamp turns into NaN, which no stamp assertion lets through.
            chunks.push({ capturedAtMs: capturedAtMs ?? Number.NaN, samples: data.slice() })
        }
    })
    return chunks
}

/** Sample `index` of `generateTestTone(frequency, _, amplitude)`. */
function toneSample(index: number, frequency = 440, amplitude = 0.3): number {
    return Math.fround(Math.sin(2 * Math.PI * frequency * (index / SAMPLE_RATE)) * amplitude)
}

function assertContiguous(chunks: readonly CapturedChunk[], from = 0): void {
    for (let i = from + 1; i < chunks.length; i++) {
        assert.equal(
            chunks[i].capturedAtMs - chunks[i - 1].capturedAtMs,
            CHUNK_MS,
            `chunk ${i} is not stamped right after chunk ${i - 1}`
        )
    }
}

/** A deterministic stream of tick lengths: every tick late by 0 to 75 ms, as under load. */
function loadedTicks(count: number): number[] {
    let seed = 0x2f6b_1d3a
    const ticks = new Array<number>(count)
    for (let i = 0; i < count; i++) {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0
        ticks[i] = TICK_MS + (seed % 76)
    }
    return ticks
}

test('fires onAudioFinished when preloaded buffer is exhausted', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })

    let finished = false
    engine.setOnAudioFinished(() => {
        finished = true
    })

    engine.generateTestTone(440, 0.06)
    engine.setAudioSender({ sendCapturedAudio: () => undefined })
    engine.startCapture()

    // One chunk reads the whole tone; the next one runs past its end.
    for (let i = 0; i < 3; i++) clock.tick(TICK_MS)

    engine.stop()
    assert.equal(finished, true)
})

test('does not fire onAudioFinished in external live mode', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })

    let finished = false
    engine.setOnAudioFinished(() => {
        finished = true
    })

    engine.setExternalMode(true)
    const chunks = recordCapture(engine)
    engine.startCapture()
    engine.feedExternalAudio(new Float32Array(CHUNK).fill(0.5))

    for (let i = 0; i < 5; i++) clock.tick(TICK_MS)

    engine.stop()
    assert.equal(chunks.length, 5, 'the clock keeps ticking past the end of the live buffer')
    assert.equal(chunks[0].samples[0], 0.5)
    assert.equal(finished, false)
})

test('feedExternalAudio returns the live buffer level in ms', () => {
    const engine = new WaAudioEngine()
    engine.setExternalMode(true)

    const level = engine.feedExternalAudio(new Float32Array(1600))
    assert.equal(level, 100)
    assert.equal(engine.getLiveBufferMs(), 100)
})

test('feedExternalAudio caps the live buffer and drops oldest on overflow', () => {
    const engine = new WaAudioEngine()
    engine.setExternalMode(true)

    let level = 0
    for (let i = 0; i < 10; i++) {
        level = engine.feedExternalAudio(new Float32Array(2000))
    }
    assert.equal(level, 750)
    assert.equal(engine.getLiveBufferMs(), 750)
})

test('feedExternalAudio keeps only the tail of an oversized chunk', () => {
    const engine = new WaAudioEngine()
    engine.setExternalMode(true)

    const level = engine.feedExternalAudio(new Float32Array(10_000))
    assert.equal(level, 625)
    assert.equal(engine.getLiveBufferMs(), 625)
})

test('feedExternalAudio is a no-op before external mode is enabled', () => {
    const engine = new WaAudioEngine()
    assert.equal(engine.feedExternalAudio(new Float32Array(1600)), 0)
    assert.equal(engine.getLiveBufferMs(), 0)
})

test('feedWatermarksMs exposes a backpressure band below the consumer drop', () => {
    const { pauseMs, resumeMs } = WaAudioEngine.feedWatermarksMs()
    assert.equal(pauseMs, 120)
    assert.equal(resumeMs, 60)
    assert.ok(resumeMs < pauseMs)
    assert.ok(pauseMs < 200)
})

/** One chunk per tick ran at 96% of real time on Windows' 62.5 ms ticks. */
test('a capture clock whose timer fires late still hands over real time', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })
    const chunks = recordCapture(engine)
    const startedAt = clock.now()
    engine.startCapture()

    let mostPerTick = 0
    for (let i = 0; i < 1_000; i++) {
        const before = chunks.length
        clock.tick(TICK_MS, WINDOWS_TICK_MS)
        mostPerTick = Math.max(mostPerTick, chunks.length - before)
    }
    engine.stop()

    const elapsedSamples = ((clock.now() - startedAt) * SAMPLE_RATE) / 1000
    const handedOver = chunks.length * CHUNK
    assert.ok(
        Math.abs(handedOver - elapsedSamples) <= CHUNK,
        `handed over ${handedOver} samples in ${elapsedSamples} of elapsed time`
    )
    assert.equal(mostPerTick, 2, 'a late tick makes up one chunk, no more')
    assert.equal(chunks[0].capturedAtMs, startedAt)
    assertContiguous(chunks)
})

test('a capture clock under load keeps real time within one chunk', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })
    const chunks = recordCapture(engine)
    const startedAt = clock.now()
    engine.startCapture()

    for (const elapsedMs of loadedTicks(2_000)) clock.tick(TICK_MS, elapsedMs)
    engine.stop()

    const elapsedSamples = ((clock.now() - startedAt) * SAMPLE_RATE) / 1000
    const handedOver = chunks.length * CHUNK
    assert.ok(
        Math.abs(handedOver - elapsedSamples) <= CHUNK,
        `handed over ${handedOver} samples in ${elapsedSamples} of elapsed time`
    )
    assertContiguous(chunks)
})

/** Forgiven, not replayed as a burst; the file resumes where it stopped. */
test('a capture stall past the catch-up cap is forgiven and shows in the stamps', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })
    engine.generateTestTone(440, 10)
    const chunks = recordCapture(engine)
    engine.startCapture()

    for (let i = 0; i < 10; i++) clock.tick(TICK_MS)
    assert.equal(chunks.length, 10)

    clock.tick(TICK_MS, 1_000)
    const burst = chunks.slice(10)
    assert.equal(burst.length, CATCH_UP_CAP, 'the stalled tick hands over the cap, no more')
    assertContiguous(burst)

    const last = burst[burst.length - 1]
    assert.ok(last.capturedAtMs + CHUNK_MS <= clock.now(), 'nothing is stamped in the future')
    assert.ok(
        last.capturedAtMs + 2 * CHUNK_MS > clock.now(),
        'after the stall the clock stands at the present again'
    )

    const skippedMs = burst[0].capturedAtMs - (chunks[9].capturedAtMs + CHUNK_MS)
    assert.ok(skippedMs > 0, 'the skipped time shows as a jump in the stamps')
    assert.equal(skippedMs % CHUNK_MS, 0)

    assert.equal(
        burst[0].samples[0],
        toneSample(10 * CHUNK),
        'the file resumes at the sample after the last one handed over'
    )

    clock.tick(TICK_MS)
    assert.equal(
        chunks.length,
        10 + CATCH_UP_CAP + 1,
        'the next punctual tick is back to one chunk'
    )
    assertContiguous(chunks, 10)
})

/** Accepting swaps the source on the running clock, so no tick is lost at the switch. */
test('warmup silence and the real source share one capture clock', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })
    engine.generateTestTone(440, 10)
    const chunks = recordCapture(engine)
    const startedAt = clock.now()
    engine.startSilenceCapture()

    for (let i = 0; i < 5; i++) clock.tick(TICK_MS)
    // The peer accepts halfway between two ticks.
    clock.tick(TICK_MS / 2)
    engine.startCapture()
    clock.tick(TICK_MS / 2)
    for (let i = 0; i < 4; i++) clock.tick(TICK_MS)
    engine.stop()

    assert.equal(chunks.length, 10, 'one chunk for every 60 ms, across the switch')
    for (let i = 0; i < chunks.length; i++) {
        assert.equal(
            chunks[i].capturedAtMs,
            startedAt + i * CHUNK_MS,
            `chunk ${i} off the timeline`
        )
    }
    for (let i = 0; i < 5; i++) {
        assert.ok(
            chunks[i].samples.every((s) => s === 0),
            `warmup chunk ${i} is silence`
        )
    }
    assert.equal(chunks[5].samples[1], toneSample(1), 'the file starts from its beginning')
    assert.equal(chunks[9].samples[0], toneSample(4 * CHUNK))
})

test('starting capture again leaves a running file where it is', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })
    engine.generateTestTone(440, 10)
    const chunks = recordCapture(engine)
    engine.startCapture()

    clock.tick(TICK_MS)
    clock.tick(TICK_MS)
    engine.startCapture()
    clock.tick(TICK_MS)
    engine.stop()

    assert.equal(chunks.length, 3)
    assert.equal(chunks[2].samples[0], toneSample(2 * CHUNK))
    assertContiguous(chunks)
})

/** Stamped with the feed buffer's target taken off, so never later than its capture. */
test('live audio is stamped about when the producer captured it', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })
    engine.setExternalMode(true)
    const chunks = recordCapture(engine)
    const producerStart = clock.now()
    engine.startSilenceCapture()

    const feedSamples = SAMPLE_RATE / 50
    const feedMs = (feedSamples / SAMPLE_RATE) * 1000
    const feed = new Float32Array(feedSamples)
    let fed = 0
    const produce = (): void => {
        for (let i = 0; i < feedSamples; i++) feed[i] = fed + i
        fed += feedSamples
        engine.feedExternalAudio(feed)
    }

    for (let i = 0; i < 16; i++) {
        clock.tick(feedMs)
        produce()
    }
    // Accepted 10 ms after a feed, 30 ms before the clock's next tick.
    clock.tick(feedMs / 2)
    const switchedAt = chunks.length
    engine.startCapture()
    clock.tick(feedMs / 2)
    produce()
    for (let i = 0; i < 300; i++) {
        clock.tick(feedMs)
        produce()
    }
    engine.stop()

    const live = chunks.slice(switchedAt)
    assert.ok(live.length > 90)
    const targetMs = WaAudioEngine.feedWatermarksMs().resumeMs
    for (const chunk of live) {
        const capturedAtMs = producerStart + (chunk.samples[0] * 1000) / SAMPLE_RATE
        const errorMs = chunk.capturedAtMs - capturedAtMs
        assert.ok(errorMs <= 0, `stamped ${errorMs} ms after the audio was captured`)
        assert.ok(errorMs >= -targetMs, `stamped ${-errorMs} ms before the audio was captured`)
    }
    // Stamps follow the clock, not the buffer level: one chunk apart however it moves.
    assertContiguous(live)
})

test('a punctual playback tick pulls one tick of audio from the playout source', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })

    const pulls: number[] = []
    let drainSize = 0
    engine.setPlayoutSource((out) => {
        pulls.push(out.length)
        return out.length
    })
    engine.setPlaybackSink((pcm) => {
        drainSize = pcm.length
    })
    engine.startPlayback()

    clock.tick(TICK_MS)
    assert.deepEqual(pulls, [DEFAULT_AUDIO_CONFIG.playbackOutputSize])
    clock.tick(TICK_MS)
    engine.stopPlayback()

    assert.equal(pulls.length, 2)
    assert.equal(drainSize, DEFAULT_AUDIO_CONFIG.playbackOutputSize)
    assert.equal(
        DEFAULT_AUDIO_CONFIG.playbackOutputSize,
        (DEFAULT_AUDIO_CONFIG.sampleRate / 1000) * DEFAULT_AUDIO_CONFIG.intervalMs,
        'the drain size has to be one tick of audio'
    )
})

/** A pull with nothing queued at all is skipped, so the consumer sees no empty frames. */
test('a pull the source fills with no audio reaches no sink', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })

    let pulls = 0
    let delivered = 0
    engine.setPlayoutSource((out) => {
        pulls++
        out.fill(0)
        return 0
    })
    engine.setPlaybackSink(() => {
        delivered++
    })
    engine.startPlayback()

    for (let i = 0; i < 4; i++) clock.tick(TICK_MS)
    engine.stopPlayback()

    assert.equal(pulls, 4, 'the playback clock keeps pulling')
    assert.equal(delivered, 0)
})

/** The tick catches a throwing source, as it does a failing sink, and keeps the clock running. */
test('a playout source that throws costs its own block, not the playback clock', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })

    let pulls = 0
    let delivered = 0
    engine.setPlayoutSource((out) => {
        if (++pulls === 2) throw new Error('decode failed')
        return out.length
    })
    engine.setPlaybackSink(() => {
        delivered++
    })
    engine.startPlayback()

    for (let i = 0; i < 4; i++) clock.tick(TICK_MS)
    engine.stopPlayback()

    assert.equal(pulls, 4, 'the clock keeps pulling after the throw')
    assert.equal(delivered, 3, 'only the block that threw is lost')
})

/** A shorter interval only checks more often: the audio still drains at real time. */
test('playback drains by elapsed time, not by how often it ticks', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ intervalMs: 10, now: clock.now })

    let queued = 2 * DEFAULT_AUDIO_CONFIG.playbackOutputSize
    let drained = 0
    engine.setPlayoutSource((out) => {
        const real = Math.min(queued, out.length)
        queued -= real
        return real
    })
    engine.setPlaybackSink((pcm) => {
        drained += pcm.length
    })
    engine.startPlayback()

    for (let i = 0; i < 5; i++) clock.tick(10)
    assert.equal(drained, 0, 'less than a block of time went by')
    clock.tick(10)
    assert.equal(drained, DEFAULT_AUDIO_CONFIG.playbackOutputSize)
    for (let i = 0; i < 6; i++) clock.tick(10)
    engine.stopPlayback()

    assert.equal(queued, 0, 'the queue has to drain')
    assert.equal(drained, 2 * DEFAULT_AUDIO_CONFIG.playbackOutputSize)
})

test('a playback clock whose timer fires late still drains real time', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })

    let pulled = 0
    let delivered = 0
    engine.setPlayoutSource((out) => {
        pulled += out.length
        out.fill(0.25)
        return out.length
    })
    engine.setPlaybackSink((pcm) => {
        delivered += pcm.length
    })
    const startedAt = clock.now()
    engine.startPlayback()

    for (let i = 0; i < 1_000; i++) clock.tick(TICK_MS, WINDOWS_TICK_MS)
    for (const elapsedMs of loadedTicks(1_000)) clock.tick(TICK_MS, elapsedMs)
    engine.stopPlayback()

    const elapsedSamples = ((clock.now() - startedAt) * SAMPLE_RATE) / 1000
    assert.ok(
        Math.abs(pulled - elapsedSamples) <= DEFAULT_AUDIO_CONFIG.playbackOutputSize,
        `pulled ${pulled} samples in ${elapsedSamples} of elapsed time`
    )
    assert.equal(delivered, pulled)
})

test('a playback stall past the catch-up cap is forgiven, not replayed', (t) => {
    const clock = createClock(t)
    const engine = new WaAudioEngine({ now: clock.now })

    let pulls = 0
    engine.setPlayoutSource((out) => {
        pulls++
        return out.length
    })
    engine.setPlaybackSink(() => undefined)
    engine.startPlayback()

    for (let i = 0; i < 5; i++) clock.tick(TICK_MS)
    clock.tick(TICK_MS, 1_000)
    assert.equal(pulls, 5 + CATCH_UP_CAP, 'the stalled tick pulls the cap, no more')
    clock.tick(TICK_MS)
    engine.stopPlayback()

    assert.equal(pulls, 5 + CATCH_UP_CAP + 1, 'the next punctual tick is back to one pull')
})
