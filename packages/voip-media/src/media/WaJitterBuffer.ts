import type { Logger } from '../logger.js'

export interface WaJitterBufferStats {
    /** Samples currently queued for playout. */
    readonly buffered: number
    /** Samples the buffer can hold. */
    readonly capacity: number
    /** Samples dropped because the buffer was full. */
    readonly dropped: number
    /** Reads that found less audio queued than they asked for. */
    readonly underruns: number
}

/**
 * The playout queue between the decoder and the speaker, read on the host's clock: when
 * full it drops the oldest samples, and a short read is padded with silence.
 */
export class WaJitterBuffer {
    private readonly logger: Logger
    private readonly ring: Float32Array
    private writePosition = 0
    private readPosition = 0
    private length = 0
    private droppedSamples = 0
    private underruns = 0

    constructor(capacitySamples: number, logger: Logger) {
        this.ring = new Float32Array(capacitySamples)
        this.logger = logger
    }

    write(samples: Float32Array): void {
        const capacity = this.ring.length
        let source = samples
        if (source.length > capacity) {
            const truncated = source.length - capacity
            this.droppedSamples += truncated
            source = source.subarray(truncated)
        }
        if (source.length === 0) {
            return
        }

        const overflow = this.length + source.length - capacity
        if (overflow > 0) {
            this.readPosition = (this.readPosition + overflow) % capacity
            this.length -= overflow
            this.droppedSamples += overflow
            this.logger.trace('jitter buffer overflow, dropped oldest', {
                droppedSamples: overflow,
                totalDropped: this.droppedSamples
            })
        }

        const head = Math.min(source.length, capacity - this.writePosition)
        this.ring.set(source.subarray(0, head), this.writePosition)
        if (head < source.length) {
            this.ring.set(source.subarray(head), 0)
        }
        this.writePosition = (this.writePosition + source.length) % capacity
        this.length += source.length
    }

    /**
     * Fills `out` from the queue and returns how many samples were real audio.
     * Whatever the queue could not cover is silence.
     */
    read(out: Float32Array): number {
        const wanted = out.length
        const drained = Math.min(wanted, this.length)

        if (drained < wanted) {
            this.underruns++
            out.fill(0, drained, wanted)
        }

        if (drained > 0) {
            const capacity = this.ring.length
            const head = Math.min(drained, capacity - this.readPosition)
            out.set(this.ring.subarray(this.readPosition, this.readPosition + head), 0)
            if (head < drained) {
                out.set(this.ring.subarray(0, drained - head), head)
            }
            this.readPosition = (this.readPosition + drained) % capacity
            this.length -= drained
        }

        return drained
    }

    /** Empties the queue; the counters keep running. */
    reset(): void {
        this.writePosition = 0
        this.readPosition = 0
        this.length = 0
    }

    get stats(): WaJitterBufferStats {
        return {
            buffered: this.length,
            capacity: this.ring.length,
            dropped: this.droppedSamples,
            underruns: this.underruns
        }
    }
}
