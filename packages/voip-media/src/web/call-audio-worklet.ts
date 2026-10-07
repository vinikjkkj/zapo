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
 * Low-pass between the device rate and 16 kHz, in both directions: flat to 6 kHz, 60 dB
 * down from 9 kHz, so what lies above 8 kHz neither folds into the band nor is imaged out.
 */
const FILTER_CUTOFF_HZ = 7_500
const FILTER_TRANSITION_HZ = 3_000
const FILTER_KAISER_BETA = 5.65

/** Kaiser's length estimate for 60 dB: a kernel spans this times `rate / transition` samples. */
const FILTER_LENGTH_FACTOR = (60 - 8) / (2.285 * 2 * Math.PI)

/**
 * Fractional positions the kernels are tabulated at, the nearest one used. A multiple of
 * 3, so at 48 kHz, where the instants fall on thirds of a sample, no phase is rounded.
 */
const FILTER_PHASES = 192

/** Samples each side of the playout instant the interpolation reads. */
const PLAYOUT_HALF_TAPS = Math.ceil(
    (FILTER_LENGTH_FACTOR * WA_CALL_AUDIO_SAMPLE_RATE) / FILTER_TRANSITION_HZ / 2
)

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
const FILTER_CUTOFF_HZ = ${FILTER_CUTOFF_HZ}
const FILTER_TRANSITION_HZ = ${FILTER_TRANSITION_HZ}
const FILTER_KAISER_BETA = ${FILTER_KAISER_BETA}
const FILTER_LENGTH_FACTOR = ${FILTER_LENGTH_FACTOR}
const FILTER_PHASES = ${FILTER_PHASES}
const PLAYOUT_HALF_TAPS = ${PLAYOUT_HALF_TAPS}
const PLAYOUT_TAPS = 2 * PLAYOUT_HALF_TAPS

function besselI0(x) {
    const quarter = (x * x) / 4
    let term = 1
    let sum = 1
    for (let k = 1; term > sum * 1e-12; k++) {
        term *= quarter / (k * k)
        sum += term
    }
    return sum
}

/**
 * Kaiser-windowed sinc low-pass kernels for a signal at \`rate\`, one row of \`taps\` per phase:
 * tap k of phase p weighs the sample at \`k + offset - p / FILTER_PHASES\`. Each row sums to one.
 */
function buildKernels(rate, taps, offset, halfWidth) {
    const cutoff = (2 * FILTER_CUTOFF_HZ) / rate
    const windowScale = 1 / besselI0(FILTER_KAISER_BETA)
    const kernels = new Float64Array((FILTER_PHASES + 1) * taps)
    for (let phase = 0; phase <= FILTER_PHASES; phase++) {
        const row = phase * taps
        let sum = 0
        for (let k = 0; k < taps; k++) {
            const t = k + offset - phase / FILTER_PHASES
            const x = Math.PI * cutoff * t
            const sinc = x === 0 ? 1 : Math.sin(x) / x
            const r = t / halfWidth
            const window =
                r * r < 1 ? besselI0(FILTER_KAISER_BETA * Math.sqrt(1 - r * r)) * windowScale : 0
            kernels[row + k] = sinc * window
            sum += kernels[row + k]
        }
        for (let k = 0; k < taps; k++) kernels[row + k] /= sum
    }
    return kernels
}

class WaCallAudioProcessor extends AudioWorkletProcessor {
    constructor() {
        super()
        this.rate = sampleRate
        this.inverseRate = 1 / sampleRate
        this.phaseScale = FILTER_PHASES / sampleRate
        this.running = true

        this.block = new Float32Array(BLOCK_SAMPLES)
        this.blockFill = 0
        this.spares = []
        this.captureSum = 0
        this.captureCount = 0
        this.capturePhase = 0

        // Room behind the read position for the past samples the interpolation reads.
        this.ring = new Float32Array(MAX_BUFFERED_SAMPLES + PLAYOUT_HALF_TAPS - 1)
        this.ringRead = 0
        this.ringLength = 0
        this.playing = false
        this.playPhase = 0

        this.captureKernels = null
        this.playoutKernels = null
        if (sampleRate > TARGET_RATE) {
            const delay = Math.ceil((FILTER_LENGTH_FACTOR * sampleRate) / FILTER_TRANSITION_HZ / 2)
            this.captureTaps = 2 * delay + 1
            this.captureKernels = buildKernels(sampleRate, this.captureTaps, -delay, delay + 1)
            // Each sample is stored twice, so the last captureTaps are always one contiguous run.
            this.captureHistory = new Float32Array(2 * this.captureTaps)
            this.captureWrite = 0
            this.playoutKernels = buildKernels(
                TARGET_RATE,
                PLAYOUT_TAPS,
                1 - PLAYOUT_HALF_TAPS,
                PLAYOUT_HALF_TAPS
            )
        }

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
        if (this.captureKernels !== null) {
            this.captureFiltered(channel, frames)
            return
        }
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

    /** Above 16 kHz: each output is the low-passed input at its own fractional instant. */
    captureFiltered(channel, frames) {
        const rate = this.rate
        const taps = this.captureTaps
        const kernels = this.captureKernels
        const history = this.captureHistory
        for (let i = 0; i < frames; i++) {
            const sample = channel === null ? 0 : channel[i]
            history[this.captureWrite] = sample
            history[this.captureWrite + taps] = sample
            this.captureWrite = this.captureWrite + 1 === taps ? 0 : this.captureWrite + 1
            this.capturePhase += TARGET_RATE
            if (this.capturePhase < rate) continue
            this.capturePhase -= rate
            // The output instant fell capturePhase / TARGET_RATE of a sample before this one.
            const row = Math.round((this.capturePhase * FILTER_PHASES) / TARGET_RATE) * taps
            const newest = this.captureWrite + taps - 1
            let value = 0
            for (let k = 0; k < taps; k++) value += kernels[row + k] * history[newest - k]
            this.emit(value)
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
            this.clearPlayoutHistory()
        }
        const ring = this.ring
        const capacity = ring.length
        const rate = this.rate
        const kernels = this.playoutKernels
        for (let i = 0; i < channel.length; i++) {
            if (this.ringLength === 0) {
                // Underrun: silence, and wait for a full prebuffer again.
                this.playing = false
                this.playPhase = 0
                channel.fill(0, i)
                return
            }
            if (kernels !== null) {
                channel[i] = this.interpolate(kernels)
            } else {
                const read = this.ringRead
                const current = ring[read]
                const next =
                    this.ringLength > 1 ? ring[read + 1 === capacity ? 0 : read + 1] : current
                channel[i] = current + (next - current) * (this.playPhase * this.inverseRate)
            }
            this.playPhase += TARGET_RATE
            while (this.playPhase >= rate && this.ringLength > 0) {
                this.playPhase -= rate
                this.ringRead = this.ringRead + 1 === capacity ? 0 : this.ringRead + 1
                this.ringLength--
            }
        }
    }

    /** The playout at the read position plus playPhase; past the ring's end it reads silence. */
    interpolate(kernels) {
        const ring = this.ring
        const capacity = ring.length
        const row = Math.round(this.playPhase * this.phaseScale) * PLAYOUT_TAPS
        const available = Math.min(PLAYOUT_TAPS, PLAYOUT_HALF_TAPS - 1 + this.ringLength)
        let read = this.ringRead - (PLAYOUT_HALF_TAPS - 1)
        if (read < 0) read += capacity
        let value = 0
        for (let k = 0; k < available; k++) {
            value += kernels[row + k] * ring[read]
            read = read + 1 === capacity ? 0 : read + 1
        }
        return value
    }

    /** On a start, the samples behind the first are the silence that was playing. */
    clearPlayoutHistory() {
        const ring = this.ring
        let slot = this.ringRead
        for (let k = 1; k < PLAYOUT_HALF_TAPS; k++) {
            slot = slot === 0 ? ring.length - 1 : slot - 1
            ring[slot] = 0
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
