import { toError } from '../errors.js'
import { isLogLevelEnabled, type Logger } from '../logger.js'

import {
    MLOW_FRAME_SIZE,
    MLOW_MAX_FRAME_SIZE,
    MLOW_SAMPLE_RATE,
    type MlowDecoder
} from './mlow-binding.js'

/**
 * Smallest concealment unit the codec library accepts (2.5 ms). PLC and FEC
 * lengths must be whole multiples of it, capped at `MLOW_MAX_FRAME_SIZE` (120 ms).
 */
const CONCEAL_QUANTUM = MLOW_SAMPLE_RATE / 400

const DEFAULT_MAX_CONCEAL_FRAMES = 5

/**
 * Fills lost audio by PLC, or from the next packet's FEC, in steps sized to the last decoded
 * frame and capped per gap. Writes into the decoder's own scratch; the decoder owns `lib`.
 */
export class WaMlowConcealer {
    private lib: MlowDecoder | null
    private readonly scratch: Float32Array
    private readonly logger: Logger
    private readonly traceEnabled: boolean
    private readonly maxConcealFrames: number
    private lastDecodedSamples = 0
    private plcFrames = 0
    private fecFrames = 0
    private concealCapped = 0

    /** Shared read-only zero frame handed out when a decode cannot be salvaged. */
    private readonly silenceScratch = new Float32Array(MLOW_MAX_FRAME_SIZE)

    constructor(
        lib: MlowDecoder,
        scratch: Float32Array,
        maxConcealFrames: number | undefined,
        logger: Logger
    ) {
        this.lib = lib
        this.scratch = scratch
        this.logger = logger
        this.traceEnabled = isLogLevelEnabled(logger, 'trace')
        this.maxConcealFrames = Math.max(
            0,
            Math.trunc(
                Number.isFinite(maxConcealFrames)
                    ? (maxConcealFrames as number)
                    : DEFAULT_MAX_CONCEAL_FRAMES
            )
        )
    }

    get plc(): number {
        return this.plcFrames
    }

    get fec(): number {
        return this.fecFrames
    }

    get capped(): number {
        return this.concealCapped
    }

    /** Records the length of a frame the decoder produced, the size the next concealment takes. */
    noteDecoded(samples: number): void {
        if (samples > 0) {
            this.lastDecodedSamples = samples
        }
    }

    resetFrameSize(): void {
        this.lastDecodedSamples = 0
    }

    /** Stops using the library decoder; freeing it is the owner's. */
    free(): void {
        this.lib = null
    }

    /**
     * Conceals `samples` in steps no longer than the last decoded frame, `maxConcealFrames` at
     * most, the step that ends the span from `fecPacket`'s FEC when given; returns those emitted.
     */
    concealSpan(
        samples: number,
        fecPacket: Uint8Array | null,
        onFrame: (pcm: Float32Array) => void
    ): number {
        const step = this.frameSize()
        let left = samples - (samples % CONCEAL_QUANTUM)
        let emitted = 0
        for (let frames = 0; left > 0; frames++) {
            if (frames === this.maxConcealFrames) {
                this.concealCapped++
                if (this.traceEnabled)
                    this.logger.trace('mlow concealment capped', { samples, frames })
                break
            }
            const size = left < step ? left : step
            left -= size
            const pcm =
                left === 0 && fecPacket ? this.recoverPrevious(fecPacket, size) : this.conceal(size)
            emitted += pcm.length
            onFrame(pcm)
        }
        return emitted
    }

    /**
     * Conceals `missing` frames, the last from `nextPacket`'s FEC (by PLC without one), and
     * returns the samples emitted.
     */
    concealGap(
        missing: number,
        nextPacket: Uint8Array | null,
        onFrame: (pcm: Float32Array) => void
    ): number {
        const limit = this.maxConcealFrames
        const frames = missing > limit ? limit : missing
        if (frames < missing) {
            this.concealCapped++
            if (this.traceEnabled) this.logger.trace('mlow concealment capped', { missing, frames })
        }
        if (frames <= 0) {
            return 0
        }

        const frameSize = this.frameSize()
        let samples = 0
        for (let i = 0; i < frames - 1; i++) {
            const pcm = this.conceal(frameSize)
            samples += pcm.length
            onFrame(pcm)
        }
        const last = nextPacket
            ? this.recoverPrevious(nextPacket, frameSize)
            : this.conceal(frameSize)
        onFrame(last)
        return samples + last.length
    }

    private recoverPrevious(nextPacket: Uint8Array, frameSize: number): Float32Array {
        if (!this.lib) {
            return this.silence(frameSize)
        }
        try {
            const samples = this.lib.decodeFloatInto(this.scratch, nextPacket, {
                decodeFec: true,
                frameSize
            })
            this.fecFrames++
            return this.scratch.subarray(0, samples)
        } catch (err) {
            if (this.traceEnabled)
                this.logger.trace('mlow fec decode failed, concealing instead', {
                    message: toError(err).message
                })
            return this.conceal(frameSize)
        }
    }

    conceal(frameSize: number): Float32Array {
        if (!this.lib) {
            return this.silence(frameSize)
        }
        try {
            const samples = this.lib.decodeFloatInto(this.scratch, null, { frameSize })
            this.plcFrames++
            return this.scratch.subarray(0, samples)
        } catch (err) {
            if (this.traceEnabled)
                this.logger.trace('mlow concealment failed', { message: toError(err).message })
            return this.silence(frameSize)
        }
    }

    /**
     * Length to conceal with, tracking the last packet the peer actually sent so
     * a stream of 20 ms frames is not patched with 60 ms of audio.
     */
    frameSize(): number {
        const last = this.lastDecodedSamples
        if (last <= 0) {
            return MLOW_FRAME_SIZE
        }
        const quantized = Math.round(last / CONCEAL_QUANTUM) * CONCEAL_QUANTUM
        if (quantized < CONCEAL_QUANTUM) {
            return CONCEAL_QUANTUM
        }
        return quantized > MLOW_MAX_FRAME_SIZE ? MLOW_MAX_FRAME_SIZE : quantized
    }

    silence(frameSize: number): Float32Array {
        const size = frameSize > MLOW_MAX_FRAME_SIZE ? MLOW_MAX_FRAME_SIZE : frameSize
        return this.silenceScratch.subarray(0, size)
    }
}
