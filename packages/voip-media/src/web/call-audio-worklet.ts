/**
 * The audio-thread half of `WaWebCallAudio`. Its capture blocks clock both directions of
 * the call, so no main-thread timer exists for a background tab to throttle.
 */

/** Name the processor registers under, shared by the module and the node that runs it. */
export const WA_CALL_AUDIO_PROCESSOR = 'wa-call-audio'

/** Rate of the media plane's audio in both directions, the rate of the codec. */
export const WA_CALL_AUDIO_SAMPLE_RATE = 16_000

/** Samples in one capture block: 20 ms at 16 kHz. */
export const WA_CALL_AUDIO_BLOCK_SAMPLES = 320

/** Message the main thread posts to end the processor. */
export const WA_CALL_AUDIO_STOP_MESSAGE = 'stop'

/**
 * Playout the ring waits for before it plays: two blocks, 40 ms. One block of
 * margin is what absorbs the main thread answering a block late, up to 20 ms.
 */
const PREBUFFER_SAMPLES = 2 * WA_CALL_AUDIO_BLOCK_SAMPLES

/** Ceiling of the ring: 200 ms at 16 kHz, ten blocks. */
const MAX_BUFFERED_SAMPLES = 3_200

/** Playout buffers kept for reuse as capture blocks; more than this are left to the collector. */
const SPARE_BLOCKS = 4

/**
 * Frames in one render quantum, used only when a quantum brings neither an input
 * nor an output channel to measure it by. Every browser renders 128.
 */
const DEFAULT_RENDER_QUANTUM = 128

/**
 * Source of the AudioWorklet module registering {@link WA_CALL_AUDIO_PROCESSOR}. A page
 * whose CSP forbids `blob:` scripts serves it as a file and passes its URL as `workletUrl`.
 */
export const WA_CALL_AUDIO_WORKLET_SOURCE = `'use strict'

const TARGET_RATE = ${WA_CALL_AUDIO_SAMPLE_RATE}
const BLOCK_SAMPLES = ${WA_CALL_AUDIO_BLOCK_SAMPLES}
const PREBUFFER_SAMPLES = ${PREBUFFER_SAMPLES}
const MAX_BUFFERED_SAMPLES = ${MAX_BUFFERED_SAMPLES}
const SPARE_BLOCKS = ${SPARE_BLOCKS}
const DEFAULT_RENDER_QUANTUM = ${DEFAULT_RENDER_QUANTUM}
const STOP_MESSAGE = ${JSON.stringify(WA_CALL_AUDIO_STOP_MESSAGE)}

class WaCallAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.rate = sampleRate
        this.inverseRate = 1 / sampleRate
        this.running = true

        this.block = new Float32Array(BLOCK_SAMPLES)
        this.blockFill = 0
        this.spares = []
        this.captureSum = 0
        this.captureCount = 0
        this.capturePhase = 0

        this.ring = new Float32Array(MAX_BUFFERED_SAMPLES)
        this.ringRead = 0
        this.ringLength = 0
        this.playing = false
        this.playPhase = 0

        this.port.onmessage = (event) => this.receive(event.data)
    }

    receive(data) {
        if (data === STOP_MESSAGE) {
            this.running = false
            this.port.onmessage = null
            return
        }
        if (!(data instanceof Float32Array)) return
        this.enqueue(data)
        if (data.length === BLOCK_SAMPLES && this.spares.length < SPARE_BLOCKS) {
            this.spares.push(data)
        }
    }

    enqueue(samples) {
        const ring = this.ring
        const capacity = ring.length
        let start = 0
        let count = samples.length
        if (this.ringLength + count > MAX_BUFFERED_SAMPLES) {
            // Past the ceiling: keep only the newest prebuffer's worth.
            if (count >= PREBUFFER_SAMPLES) {
                start = count - PREBUFFER_SAMPLES
                count = PREBUFFER_SAMPLES
                this.ringLength = 0
            } else {
                const drop = this.ringLength + count - PREBUFFER_SAMPLES
                this.ringRead = (this.ringRead + drop) % capacity
                this.ringLength -= drop
            }
        }
        let write = (this.ringRead + this.ringLength) % capacity
        for (let i = 0; i < count; i++) {
            ring[write] = samples[start + i]
            write = write + 1 === capacity ? 0 : write + 1
        }
        this.ringLength += count
    }

    capture(channel, frames) {
        const rate = this.rate
        for (let i = 0; i < frames; i++) {
            this.captureSum += channel === null ? 0 : channel[i]
            this.captureCount++
            this.capturePhase += TARGET_RATE
            if (this.capturePhase < rate) continue
            // The box closed: its average is one 16 kHz sample. Below 16 kHz
            // one input sample closes several boxes and is held across them.
            const value = this.captureSum / this.captureCount
            do {
                this.emit(value)
                this.capturePhase -= rate
            } while (this.capturePhase >= rate)
            this.captureSum = 0
            this.captureCount = 0
        }
    }

    emit(value) {
        this.block[this.blockFill++] = value
        if (this.blockFill < BLOCK_SAMPLES) return
        const full = this.block
        this.block = this.spares.length > 0 ? this.spares.pop() : new Float32Array(BLOCK_SAMPLES)
        this.blockFill = 0
        this.port.postMessage(full, [full.buffer])
    }

    render(channel) {
        if (!this.playing) {
            if (this.ringLength < PREBUFFER_SAMPLES) {
                channel.fill(0)
                return
            }
            this.playing = true
            this.playPhase = 0
        }
        const ring = this.ring
        const capacity = ring.length
        const rate = this.rate
        for (let i = 0; i < channel.length; i++) {
            if (this.ringLength === 0) {
                // Underrun: silence, and wait for a full prebuffer again.
                this.playing = false
                this.playPhase = 0
                channel.fill(0, i)
                return
            }
            const read = this.ringRead
            const current = ring[read]
            const next = this.ringLength > 1 ? ring[read + 1 === capacity ? 0 : read + 1] : current
            channel[i] = current + (next - current) * (this.playPhase * this.inverseRate)
            this.playPhase += TARGET_RATE
            while (this.playPhase >= rate && this.ringLength > 0) {
                this.playPhase -= rate
                this.ringRead = this.ringRead + 1 === capacity ? 0 : this.ringRead + 1
                this.ringLength--
            }
        }
    }

    process(inputs, outputs) {
        if (!this.running) return false
        const input = inputs[0]
        const output = outputs[0]
        const captured = input !== undefined && input.length > 0 ? input[0] : null
        const played = output !== undefined && output.length > 0 ? output[0] : null
        const frames =
            captured !== null ? captured.length : played !== null ? played.length : DEFAULT_RENDER_QUANTUM
        this.capture(captured, frames)
        if (played !== null) {
            this.render(played)
            for (let c = 1; c < output.length; c++) output[c].set(played)
        }
        return true
    }
}

try {
    registerProcessor(${JSON.stringify(WA_CALL_AUDIO_PROCESSOR)}, WaCallAudioProcessor)
} catch {
    // Loading this module again into a context that already runs it, as a
    // second call on a shared context does, throws on the duplicate name; the
    // processor registered the first time is this same one.
}
`
