import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    WA_CALL_AUDIO_BLOCK_SAMPLES,
    WA_CALL_AUDIO_PROCESSOR,
    WA_CALL_AUDIO_STOP_MESSAGE,
    WA_CALL_AUDIO_WORKLET_SOURCE
} from '../call-audio-worklet.js'

/** Frames in one render quantum, what every browser hands `process()`. */
const QUANTUM = 128
const BLOCK = WA_CALL_AUDIO_BLOCK_SAMPLES

interface WorkletProcessor {
    process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean
}

type ProcessorConstructor = new () => WorkletProcessor

/** The processor's port; posts go through `structuredClone`, so transfers really detach. */
class FakeProcessorPort {
    onmessage: ((event: { readonly data: unknown }) => void) | null = null
    readonly posted: unknown[] = []

    postMessage(message: unknown, transfer: ArrayBuffer[] = []): void {
        this.posted.push(structuredClone(message, { transfer }))
    }

    /** A message from the main thread, arriving as its own copy; returns what the processor got. */
    deliver<T>(message: T, transfer: ArrayBuffer[] = []): T {
        const received = structuredClone(message, { transfer })
        this.onmessage?.({ data: received })
        return received
    }
}

interface LoadedProcessor {
    readonly processor: WorkletProcessor
    readonly port: FakeProcessorPort
}

/** Evaluates the real module source against fake `AudioWorkletGlobalScope` globals. */
function evaluateModule(sampleRate: number, registry: Map<string, ProcessorConstructor>): void {
    class FakeAudioWorkletProcessor {
        readonly port = new FakeProcessorPort()
    }
    const registerProcessor = (name: string, processor: ProcessorConstructor): void => {
        if (registry.has(name)) throw new Error('NotSupportedError: name already registered')
        registry.set(name, processor)
    }
    const evaluate = new Function(
        'AudioWorkletProcessor',
        'registerProcessor',
        'sampleRate',
        WA_CALL_AUDIO_WORKLET_SOURCE
    ) as (base: unknown, register: typeof registerProcessor, rate: number) => void
    evaluate(FakeAudioWorkletProcessor, registerProcessor, sampleRate)
}

function loadProcessor(sampleRate: number): LoadedProcessor {
    const registry = new Map<string, ProcessorConstructor>()
    evaluateModule(sampleRate, registry)
    const Processor = registry.get(WA_CALL_AUDIO_PROCESSOR)
    assert.ok(Processor, 'the module registers the processor under its name')
    const processor = new Processor()
    return { processor, port: (processor as unknown as { port: FakeProcessorPort }).port }
}

/** Runs one render quantum and returns what the processor played. */
function runQuantum(processor: WorkletProcessor, input: Float32Array | null): Float32Array {
    const output = new Float32Array(QUANTUM)
    const kept = processor.process([input === null ? [] : [input]], [[output]])
    assert.equal(kept, true, 'a running processor keeps itself alive')
    return output
}

/** Runs `count` quanta with no input and returns everything played, in order. */
function playQuanta(processor: WorkletProcessor, count: number): Float32Array {
    const played = new Float32Array(count * QUANTUM)
    for (let q = 0; q < count; q++) played.set(runQuantum(processor, null), q * QUANTUM)
    return played
}

function captureBlocks(port: FakeProcessorPort): Float32Array[] {
    return port.posted.filter((message): message is Float32Array => {
        return message instanceof Float32Array
    })
}

/** Samples that are all distinct and all nonzero, so order and silence both show. */
function ramp(length: number, first: number): Float32Array {
    const samples = new Float32Array(length)
    for (let i = 0; i < length; i++) samples[i] = (first + i + 1) / 4_096
    return samples
}

function isSilent(samples: Float32Array): boolean {
    return samples.every((sample) => sample === 0)
}

/** Frames played before the first silent one. */
function countUntilSilence(samples: Float32Array): number {
    const index = samples.findIndex((sample) => sample === 0)
    return index === -1 ? samples.length : index
}

function sine(length: number, amplitude: number, frequency: number, rate: number): Float32Array {
    const samples = new Float32Array(length)
    for (let n = 0; n < length; n++) {
        samples[n] = amplitude * Math.sin((2 * Math.PI * frequency * n) / rate)
    }
    return samples
}

/** Least-squares fit of a `frequency` sinusoid: its amplitude and the RMS of what is left. */
function measureTone(
    samples: Float32Array,
    frequency: number,
    rate: number
): { amplitude: number; residual: number } {
    const step = (2 * Math.PI * frequency) / rate
    let ss = 0
    let cc = 0
    let sc = 0
    let xs = 0
    let xc = 0
    for (let n = 0; n < samples.length; n++) {
        const s = Math.sin(step * n)
        const c = Math.cos(step * n)
        ss += s * s
        cc += c * c
        sc += s * c
        xs += samples[n] * s
        xc += samples[n] * c
    }
    const determinant = ss * cc - sc * sc
    const a = (xs * cc - xc * sc) / determinant
    const b = (xc * ss - xs * sc) / determinant
    let left = 0
    for (let n = 0; n < samples.length; n++) {
        const error = samples[n] - a * Math.sin(step * n) - b * Math.cos(step * n)
        left += error * error
    }
    return { amplitude: Math.hypot(a, b), residual: Math.sqrt(left / samples.length) }
}

function rms(samples: Float32Array): number {
    let sum = 0
    for (const sample of samples) sum += sample * sample
    return Math.sqrt(sum / samples.length)
}

function decibels(ratio: number): number {
    return 20 * Math.log10(ratio)
}

/** Feeds `input` through the capture a quantum at a time and returns the 16 kHz it posted. */
function captureAll(processor: WorkletProcessor, port: FakeProcessorPort, input: Float32Array) {
    for (let q = 0; q + QUANTUM <= input.length; q += QUANTUM) {
        runQuantum(processor, input.subarray(q, q + QUANTUM))
    }
    return Float32Array.from(captureBlocks(port).flatMap((block) => Array.from(block)))
}

/** 16 kHz output samples the capture filter needs before it holds only real input. */
const CAPTURE_SETTLE = 64

test('at 16 kHz the capture comes out in 320-sample blocks, in order and unchanged', () => {
    const { processor, port } = loadProcessor(16_000)
    const captured = ramp(QUANTUM * 10, 0)

    for (let q = 0; q < 10; q++) {
        runQuantum(processor, captured.subarray(q * QUANTUM, (q + 1) * QUANTUM))
    }

    const blocks = captureBlocks(port)
    assert.equal(blocks.length, 4, '1280 samples are four whole blocks')
    for (let b = 0; b < blocks.length; b++) {
        assert.equal(blocks[b].length, BLOCK)
        assert.deepEqual(
            Array.from(blocks[b]),
            Array.from(captured.subarray(b * BLOCK, (b + 1) * BLOCK))
        )
    }
})

test('at 48 kHz a 1 kHz sine comes down to 16 kHz whole, 128 / 3 samples a quantum', () => {
    const { processor, port } = loadProcessor(48_000)
    const amplitude = 0.5
    const quanta = 30
    const captured = sine(quanta * QUANTUM, amplitude, 1_000, 48_000)

    const blocksAfter: number[] = []
    for (let q = 0; q < quanta; q++) {
        runQuantum(processor, captured.subarray(q * QUANTUM, (q + 1) * QUANTUM))
        blocksAfter.push(captureBlocks(port).length)
    }

    // Block b closes on input frame 960b - 1, in quantum floor((960b - 1) / 128).
    const closedIn = [7, 14, 22, 29]
    for (let q = 0; q < quanta; q++) {
        const expected = closedIn.filter((closing) => closing <= q).length
        assert.equal(blocksAfter[q], expected, `blocks posted after quantum ${q}`)
    }

    const downsampled = Float32Array.from(captureBlocks(port).flatMap((block) => Array.from(block)))
    assert.equal(downsampled.length, 1_280)
    const { amplitude: measured, residual } = measureTone(
        downsampled.subarray(CAPTURE_SETTLE),
        1_000,
        16_000
    )
    assert.ok(Math.abs(measured / amplitude - 1) < 1e-3, `amplitude ${measured}`)
    assert.ok(residual < 1e-4 * amplitude, `residual ${residual}`)
})

test('at 48 kHz a tone above 8 kHz is filtered out, not folded into the band', () => {
    for (const frequency of [9_000, 12_000]) {
        const { processor, port } = loadProcessor(48_000)
        const amplitude = 0.5
        const downsampled = captureAll(
            processor,
            port,
            sine(60 * QUANTUM, amplitude, frequency, 48_000)
        )

        // Averaging three samples would let 12 kHz through at -9.5 dB, folded to 4 kHz.
        const level = decibels(rms(downsampled.subarray(CAPTURE_SETTLE)) / (amplitude / Math.SQRT2))
        assert.ok(level < -60, `${frequency} Hz came out at ${level.toFixed(1)} dB`)
    }
})

test('at 44.1 kHz the fractional ratio carries across quanta without drifting', () => {
    const { processor, port } = loadProcessor(44_100)
    const captured = new Float32Array(QUANTUM).fill(0.25)

    // 441 quanta are 56448 frames, exactly 20480 samples at 16 / 44.1: 64 blocks.
    for (let q = 0; q < 441; q++) runQuantum(processor, captured)

    const blocks = captureBlocks(port)
    assert.equal(blocks.length, 64)
    const settled = blocks.flatMap((block) => Array.from(block)).slice(CAPTURE_SETTLE)
    assert.ok(settled.every((sample) => sample === 0.25))
})

test('at 44.1 kHz each sample is taken at its own instant, so a 4 kHz tone stays clean', () => {
    const { processor, port } = loadProcessor(44_100)
    const amplitude = 0.5
    const downsampled = captureAll(processor, port, sine(200 * QUANTUM, amplitude, 4_000, 44_100))

    const { amplitude: measured, residual } = measureTone(
        downsampled.subarray(CAPTURE_SETTLE),
        4_000,
        16_000
    )
    assert.ok(Math.abs(measured / amplitude - 1) < 0.01, `amplitude ${measured}`)
    // Rounding each instant to a whole input sample would leave noise near -20 dB.
    const noise = decibels(residual / (amplitude / Math.SQRT2))
    assert.ok(noise < -50, `noise at ${noise.toFixed(1)} dB`)
})

test('a quantum without input still clocks the capture, as silence', () => {
    const { processor, port } = loadProcessor(16_000)

    playQuanta(processor, 5)

    const blocks = captureBlocks(port)
    assert.equal(blocks.length, 2, 'five empty quanta are 640 samples of clock')
    assert.ok(blocks.every(isSilent))
})

test('playout starts after a prebuffer of two blocks and plays them in order', () => {
    const { processor, port } = loadProcessor(16_000)
    const first = ramp(BLOCK, 0)
    const second = ramp(BLOCK, BLOCK)

    port.deliver(first)
    assert.ok(isSilent(runQuantum(processor, null)), 'one block is below the prebuffer')

    port.deliver(second)
    const played = playQuanta(processor, 5)

    assert.deepEqual(Array.from(played), [...first, ...second])
    assert.ok(isSilent(runQuantum(processor, null)), 'the ring ran dry')
})

test('an underrun plays silence and waits for a full prebuffer again', () => {
    const { processor, port } = loadProcessor(16_000)
    port.deliver(ramp(700, 0))

    const played = playQuanta(processor, 6)
    assert.equal(countUntilSilence(played), 700, 'all of it plays, then it runs dry')
    assert.ok(isSilent(played.subarray(700)), 'the rest of the quantum is silence')

    const again = ramp(BLOCK, 1_000)
    port.deliver(again)
    assert.ok(isSilent(runQuantum(processor, null)), 'one block is not enough after an underrun')

    port.deliver(ramp(BLOCK, 2_000))
    const resumed = runQuantum(processor, null)
    assert.deepEqual(Array.from(resumed), Array.from(again.subarray(0, QUANTUM)))
})

test('the ring holds 200 ms and past that keeps only the newest prebuffer', () => {
    const atCeiling = loadProcessor(16_000)
    for (let b = 0; b < 10; b++) atCeiling.port.deliver(ramp(BLOCK, b * BLOCK))
    const full = playQuanta(atCeiling.processor, 26)
    assert.equal(countUntilSilence(full), 3_200, 'ten blocks, 200 ms, are kept whole')

    const overfed = loadProcessor(16_000)
    const blocks = Array.from({ length: 20 }, (_, b) => ramp(BLOCK, b * BLOCK))
    for (const block of blocks) overfed.port.deliver(block)
    const trimmed = playQuanta(overfed.processor, 8)

    assert.equal(countUntilSilence(trimmed), 2 * BLOCK, 'what is left is one prebuffer')
    assert.deepEqual(Array.from(trimmed.subarray(0, 2 * BLOCK)), [...blocks[18], ...blocks[19]])
})

test('at 48 kHz playout runs three frames per sample', () => {
    const { processor, port } = loadProcessor(48_000)
    port.deliver(new Float32Array(2 * BLOCK).fill(0.5))

    const played = playQuanta(processor, 16)

    assert.equal(countUntilSilence(played), 3 * 2 * BLOCK)
    // Away from the edges, where the filter reaches past the stream, the level is exact.
    assert.ok(played.subarray(60, 3 * 2 * BLOCK - 60).every((sample) => sample === 0.5))
})

test('at 48 kHz playout keeps the band and leaves no image above it', () => {
    const { processor, port } = loadProcessor(48_000)
    const amplitude = 0.5
    port.deliver(sine(10 * BLOCK, amplitude, 6_000, 16_000))

    const played = playQuanta(processor, 70).subarray(300)

    const tone = measureTone(played, 6_000, 48_000)
    assert.ok(Math.abs(tone.amplitude / amplitude - 1) < 0.01, `amplitude ${tone.amplitude}`)
    // Linear interpolation leaves the 10 kHz image of a 6 kHz tone at -12 dB.
    const image = decibels(measureTone(played, 10_000, 48_000).amplitude / amplitude)
    assert.ok(image < -60, `image at ${image.toFixed(1)} dB`)
})

test('at 48 kHz a restart after an underrun reads silence behind it, not the old stream', () => {
    const { processor, port } = loadProcessor(48_000)
    port.deliver(new Float32Array(2 * BLOCK).fill(0.5))
    playQuanta(processor, 16)

    port.deliver(new Float32Array(2 * BLOCK))
    assert.ok(isSilent(playQuanta(processor, 4)))
})

test('answered block for block, the loop never underruns once it plays', () => {
    const { processor, port } = loadProcessor(48_000)
    const microphone = new Float32Array(QUANTUM).fill(0.1)
    // Each block is answered 0 to 6 quanta late, in order, like a busy page.
    const delays = [0, 3, 6, 1, 5, 2, 6, 0, 4]
    const pending: { readonly due: number; readonly answer: Float32Array }[] = []
    let answered = 0
    let startedAt = -1

    for (let q = 0; q < 600; q++) {
        while (pending.length > 0 && pending[0].due <= q) port.deliver(pending.shift()!.answer)
        const played = runQuantum(processor, microphone)
        for (const block of captureBlocks(port).slice(answered)) {
            const previousDue = pending.length > 0 ? pending[pending.length - 1].due : 0
            const due = Math.max(q + delays[answered % delays.length], previousDue)
            pending.push({ due, answer: new Float32Array(block.length).fill(0.5) })
            answered++
        }
        if (startedAt === -1 && !isSilent(played)) startedAt = q
        if (startedAt !== -1 && q > startedAt) {
            assert.ok(
                played.every((sample) => sample === 0.5),
                `quantum ${q} played the answers`
            )
        }
    }
    assert.ok(startedAt !== -1 && startedAt < 30, `playout started at quantum ${startedAt}`)
})

test('a playout buffer is reused as a later capture block', () => {
    const { processor, port } = loadProcessor(16_000)
    const answer = new Float32Array(BLOCK)
    const received = port.deliver(answer, [answer.buffer])
    assert.equal(answer.byteLength, 0, 'the main thread transferred its answer away')

    // The second block is the buffer the processor received, so posting it transfers it away.
    playQuanta(processor, 5)

    assert.equal(captureBlocks(port).length, 2)
    assert.equal(received.byteLength, 0, 'the received buffer left as a capture block')
})

test('the stop message ends the processor', () => {
    const { processor, port } = loadProcessor(16_000)
    playQuanta(processor, 2)
    const postedBefore = port.posted.length

    port.deliver(WA_CALL_AUDIO_STOP_MESSAGE)
    const output = new Float32Array(QUANTUM)

    assert.equal(processor.process([[new Float32Array(QUANTUM)]], [[output]]), false)
    assert.equal(port.posted.length, postedBefore, 'nothing is captured after stop')
})

test('loading the module twice into one scope keeps the first registration', () => {
    const registry = new Map<string, ProcessorConstructor>()
    evaluateModule(16_000, registry)
    const first = registry.get(WA_CALL_AUDIO_PROCESSOR)

    assert.doesNotThrow(() => evaluateModule(16_000, registry))
    assert.equal(registry.get(WA_CALL_AUDIO_PROCESSOR), first)
})
