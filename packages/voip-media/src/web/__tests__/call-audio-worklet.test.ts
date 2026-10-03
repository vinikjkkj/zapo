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

    /** A message from the main thread, arriving as its own copy. */
    deliver(message: unknown): void {
        this.onmessage?.({ data: message })
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

test('at 48 kHz a 1 kHz sine is averaged down to 16 kHz, 128 / 3 samples a quantum', () => {
    const { processor, port } = loadProcessor(48_000)
    const amplitude = 0.5
    const frequency = 1_000
    const step = (2 * Math.PI * frequency) / 48_000
    const quanta = 30
    const captured = new Float32Array(quanta * QUANTUM)
    for (let n = 0; n < captured.length; n++) captured[n] = amplitude * Math.sin(step * n)

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

    // A 3-sample average scales a sine by (1 + 2cos(step)) / 3: 99.4 % at 1 kHz.
    const gain = (1 + 2 * Math.cos(step)) / 3
    const downsampled = captureBlocks(port).flatMap((block) => Array.from(block))
    assert.equal(downsampled.length, 1_280)
    let energy = 0
    for (let k = 0; k < downsampled.length; k++) {
        const expected = gain * amplitude * Math.sin(step * (3 * k + 1))
        assert.ok(Math.abs(downsampled[k] - expected) < 1e-5, `sample ${k}`)
        energy += downsampled[k] * downsampled[k]
    }
    // RMS over 80 whole periods; the sampled peak would read low at 16 kHz.
    const measured = Math.sqrt((2 * energy) / downsampled.length)
    assert.ok(measured > 0.99 * amplitude && measured <= amplitude, `amplitude ${measured}`)
})

test('at 44.1 kHz the fractional ratio carries across quanta without drifting', () => {
    const { processor, port } = loadProcessor(44_100)
    const captured = new Float32Array(QUANTUM).fill(0.25)

    // 441 quanta are 56448 frames, exactly 20480 samples at 16 / 44.1: 64 blocks.
    for (let q = 0; q < 441; q++) runQuantum(processor, captured)

    const blocks = captureBlocks(port)
    assert.equal(blocks.length, 64)
    assert.ok(blocks.every((block) => block.every((sample) => sample === 0.25)))
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

    port.deliver(first.slice())
    assert.ok(isSilent(runQuantum(processor, null)), 'one block is below the prebuffer')

    port.deliver(second.slice())
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
    port.deliver(again.slice())
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
    for (const block of blocks) overfed.port.deliver(block.slice())
    const trimmed = playQuanta(overfed.processor, 8)

    assert.equal(countUntilSilence(trimmed), 2 * BLOCK, 'what is left is one prebuffer')
    assert.deepEqual(Array.from(trimmed.subarray(0, 2 * BLOCK)), [...blocks[18], ...blocks[19]])
})

test('at 48 kHz playout is interpolated up to three samples per sample', () => {
    const { processor, port } = loadProcessor(48_000)
    const samples = ramp(2 * BLOCK, 0)
    port.deliver(samples.slice())

    const played = playQuanta(processor, 16)

    assert.equal(countUntilSilence(played), 3 * samples.length)
    // Linear interpolation of a straight line: output frame t sits at input t / 3.
    for (let t = 0; t < 3 * (samples.length - 1); t++) {
        const expected = (t / 3 + 1) / 4_096
        assert.ok(Math.abs(played[t] - expected) < 1e-6, `frame ${t}`)
    }
    // Nothing follows the last sample, so it is held rather than ramped to zero.
    const last = samples[samples.length - 1]
    for (let t = 3 * (samples.length - 1); t < 3 * samples.length; t++) {
        assert.equal(played[t], last)
    }
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
    const handedBack = new Float32Array(BLOCK)
    port.deliver(handedBack)

    // The second block is the buffer handed back, so posting it transfers it away.
    playQuanta(processor, 5)

    assert.equal(captureBlocks(port).length, 2)
    assert.equal(handedBack.byteLength, 0, 'the handed-back buffer left as a capture block')
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
