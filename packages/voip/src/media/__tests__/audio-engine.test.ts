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

test('jitter buffer holds a full 120 ms packet with two aggregated frames', () => {
    const engine = new WaAudioEngine()

    assert.equal(engine.getMaxPacketSamples(), 3840)

    engine.onPlaybackData(new Float32Array(3840))

    const stats = engine.getPlaybackStats()
    assert.equal(stats.buffered, 3840)
    assert.equal(stats.dropped, 0)
    assert.ok(stats.capacity >= 3840)
})

test('default config states the capacity and drain size the engine really uses', async () => {
    const engine = new WaAudioEngine()

    assert.equal(engine.getPlaybackStats().capacity, DEFAULT_AUDIO_CONFIG.maxBufferSize)
    assert.equal(DEFAULT_AUDIO_CONFIG.maxBufferSize, engine.getMaxPacketSamples() * 3)

    let drainSize = 0
    engine.setPlaybackSink((pcm) => {
        drainSize = pcm.length
    })
    engine.startPlayback()
    engine.onPlaybackData(new Float32Array(DEFAULT_AUDIO_CONFIG.playbackOutputSize))

    await new Promise((resolve) => setTimeout(resolve, DEFAULT_AUDIO_CONFIG.intervalMs * 2))
    engine.stopPlayback()

    assert.equal(drainSize, DEFAULT_AUDIO_CONFIG.playbackOutputSize)
    assert.equal(
        DEFAULT_AUDIO_CONFIG.playbackOutputSize,
        (DEFAULT_AUDIO_CONFIG.sampleRate / 1000) * DEFAULT_AUDIO_CONFIG.intervalMs,
        'the drain size has to be one tick of audio'
    )
})

test('jitter buffer capacity scales with the configured headroom', () => {
    const tight = new WaAudioEngine({ jitterHeadroomPackets: 1 })
    assert.equal(tight.getPlaybackStats().capacity, 3840)

    const roomy = new WaAudioEngine({ jitterHeadroomPackets: 4 })
    assert.equal(roomy.getPlaybackStats().capacity, 3840 * 4)
})

test('jitter buffer drops the oldest audio once it is full', () => {
    const engine = new WaAudioEngine({ jitterHeadroomPackets: 1 })

    const first = new Float32Array(3840).fill(0.25)
    const second = new Float32Array(960).fill(0.5)
    engine.onPlaybackData(first)
    engine.onPlaybackData(second)

    const stats = engine.getPlaybackStats()
    assert.equal(stats.buffered, 3840)
    assert.equal(stats.dropped, 960)
})

test('jitter buffer reorders packets that arrive within the window', async () => {
    const engine = new WaAudioEngine({ playbackOutputSize: 960, intervalMs: 5 })

    const played: number[] = []
    engine.setPlaybackSink((pcm) => {
        played.push(pcm[0])
    })

    engine.startPlayback()
    engine.onPlaybackPacket(1, new Float32Array(960).fill(0.1))
    engine.onPlaybackPacket(3, new Float32Array(960).fill(0.3))
    engine.onPlaybackPacket(2, new Float32Array(960).fill(0.2))

    await new Promise((resolve) => setTimeout(resolve, 80))
    engine.stopPlayback()

    assert.deepEqual(
        played.map((value) => Math.round(value * 10)),
        [1, 2, 3]
    )
    assert.equal(engine.getPlaybackStats().reordered, 1)
    assert.equal(engine.getPlaybackStats().late, 0)
})

test('jitter buffer gives up on a hole once a packet arrives past the window', () => {
    const engine = new WaAudioEngine({ reorderWindowPackets: 4 })

    engine.onPlaybackPacket(1, new Float32Array(960))
    engine.onPlaybackPacket(3, new Float32Array(960))
    assert.equal(engine.getPlaybackStats().buffered, 960, 'packet 3 waits on packet 2')

    engine.onPlaybackPacket(40, new Float32Array(960))
    assert.equal(
        engine.getPlaybackStats().buffered,
        960 * 3,
        'the parked packet is released once the hole is abandoned'
    )
})

test('jitter buffer bounds how many packets the reorder window parks', () => {
    const engine = new WaAudioEngine({ reorderWindowPackets: 4 })

    engine.onPlaybackPacket(1, new Float32Array(960))
    for (let seq = 3; seq <= 5; seq++) {
        engine.onPlaybackPacket(seq, new Float32Array(960))
    }
    assert.equal(engine.getPlaybackStats().buffered, 960, 'a full window parks and nothing else')

    engine.onPlaybackPacket(6, new Float32Array(960))

    const stats = engine.getPlaybackStats()
    assert.equal(stats.buffered, 960 * 5)
    assert.equal(stats.reordered, 3)
    assert.equal(stats.dropped, 0)
})

test('jitter buffer discards a packet playback already moved past', () => {
    const engine = new WaAudioEngine()

    engine.onPlaybackPacket(10, new Float32Array(960))
    engine.onPlaybackPacket(11, new Float32Array(960))
    engine.onPlaybackPacket(9, new Float32Array(960))

    const stats = engine.getPlaybackStats()
    assert.equal(stats.buffered, 960 * 2)
    assert.equal(stats.late, 1)
})

test('playback drain keeps up with the wall clock', async () => {
    const engine = new WaAudioEngine({ intervalMs: 10 })

    let drained = 0
    engine.setPlaybackSink((pcm) => {
        drained += pcm.length
    })

    engine.startPlayback()
    for (let i = 0; i < 6; i++) {
        engine.onPlaybackData(new Float32Array(160))
    }

    await waitUntil(() => drained >= 960)
    engine.stopPlayback()

    assert.ok(drained >= 960, `expected the queue to drain, got ${drained} samples`)
    assert.equal(engine.getPlaybackStats().buffered, 0)
})

test('mute keeps the capture stream alive and sends silence', async () => {
    const engine = new WaAudioEngine({ captureChunkSize: 960, intervalMs: 5 })

    let chunks = 0
    let voiced = 0
    engine.setAudioSender({
        sendCapturedAudio: (data) => {
            chunks++
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== 0) {
                    voiced++
                    break
                }
            }
        }
    })

    engine.generateTestTone(440, 1)
    engine.setMuted(true)
    engine.startCapture()

    await waitUntil(() => chunks >= 4)
    engine.stop()

    assert.equal(engine.isMuted(), true)
    assert.ok(chunks >= 4, `expected the capture interval to keep ticking, got ${chunks} chunks`)
    assert.equal(voiced, 0)
})

test('unmuting resumes real audio on the same capture interval', async () => {
    const engine = new WaAudioEngine({ captureChunkSize: 960, intervalMs: 5 })

    let voiced = 0
    engine.setAudioSender({
        sendCapturedAudio: (data) => {
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== 0) {
                    voiced++
                    break
                }
            }
        }
    })

    engine.generateTestTone(440, 1)
    engine.setMuted(true)
    engine.startCapture()

    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(voiced, 0)

    engine.setMuted(false)
    await waitUntil(() => voiced > 0)
    engine.stop()

    assert.ok(voiced > 0, 'capture has to deliver real audio again after unmute')
})
