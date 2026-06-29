import assert from 'node:assert/strict'
import { test } from 'node:test'

import { WaAudioEngine } from '../WaAudioEngine.js'

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
    assert.equal(level, 500)
    assert.equal(engine.getLiveBufferMs(), 500)
})

test('feedExternalAudio keeps only the tail of an oversized chunk', () => {
    const engine = new WaAudioEngine()
    engine.setExternalMode(true)

    const level = engine.feedExternalAudio(new Float32Array(10_000))
    assert.equal(level, 500)
    assert.equal(engine.getLiveBufferMs(), 500)
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
