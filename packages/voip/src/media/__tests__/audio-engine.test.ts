import assert from 'node:assert/strict'
import { test } from 'node:test'

import { DEFAULT_AUDIO_CONFIG } from '../../types.js'
import { WaAudioEngine } from '../WaAudioEngine.js'

/** Polls until the capture interval has ticked enough, so a slow timer cannot fail the run. */
async function waitUntil(done: () => boolean, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!done() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 5))
    }
}

test('fires onAudioFinished when preloaded buffer is exhausted', async () => {
    const engine = new WaAudioEngine({
        captureChunkSize: 960,
        intervalMs: 5
    })

    let finished = false
    engine.setOnAudioFinished(() => {
        finished = true
    })

    engine.generateTestTone(440, 0.06)
    engine.setAudioSender({ sendCapturedAudio: () => undefined })
    engine.startCapture()

    await new Promise((resolve) => setTimeout(resolve, 100))

    engine.stop()
    assert.equal(finished, true)
})

test('does not fire onAudioFinished in external live mode', async () => {
    const engine = new WaAudioEngine({
        captureChunkSize: 960,
        intervalMs: 5
    })

    let finished = false
    engine.setOnAudioFinished(() => {
        finished = true
    })

    engine.setExternalMode(true)
    engine.setAudioSender({ sendCapturedAudio: () => undefined })
    engine.startCapture()
    engine.feedExternalAudio(new Float32Array(960))

    await new Promise((resolve) => setTimeout(resolve, 100))

    engine.stop()
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

test('default config pulls one tick of audio from the playout source per tick', async () => {
    const engine = new WaAudioEngine()

    let drainSize = 0
    engine.setPlayoutSource((out) => out.length)
    engine.setPlaybackSink((pcm) => {
        drainSize = pcm.length
    })
    engine.startPlayback()

    await waitUntil(() => drainSize > 0)
    engine.stopPlayback()

    assert.equal(drainSize, DEFAULT_AUDIO_CONFIG.playbackOutputSize)
    assert.equal(
        DEFAULT_AUDIO_CONFIG.playbackOutputSize,
        (DEFAULT_AUDIO_CONFIG.sampleRate / 1000) * DEFAULT_AUDIO_CONFIG.intervalMs,
        'the drain size has to be one tick of audio'
    )
})

/** A tick with nothing queued at all is skipped, so the consumer sees no empty frames. */
test('a tick the source fills with no audio reaches no sink', async () => {
    const engine = new WaAudioEngine({ intervalMs: 5 })

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

    await waitUntil(() => pulls >= 4)
    engine.stopPlayback()

    assert.ok(pulls >= 4, `expected the playback tick to keep pulling, got ${pulls}`)
    assert.equal(delivered, 0)
})

test('playback drain keeps up with the wall clock', async () => {
    const engine = new WaAudioEngine({ intervalMs: 10 })

    let queued = 960
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
    await waitUntil(() => queued === 0)
    engine.stopPlayback()

    assert.equal(queued, 0, 'the queue has to drain')
    assert.ok(drained >= 960, `expected the queue to drain, got ${drained} samples`)
})
