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
