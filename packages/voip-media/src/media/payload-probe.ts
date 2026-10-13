import type { MLowDecodeOutcome } from './mlow-codec.js'

/** Distinct timestamp steps tallied; the rest are counted together. */
const MAX_STEPS = 16
/** Streams whose last timestamp is kept for the step. */
const MAX_STREAMS = 64

/**
 * Describes an audio payload type as it arrives: the first byte of each payload, the payload
 * sizes, the RTP timestamp step per stream and what the decoder made of it. Costs nothing per
 * packet beyond counters; {@link summary} builds the report.
 */
export class AudioPayloadProbe {
    received = 0
    decoded = 0
    rejected = 0
    private readonly firstBytes = new Uint32Array(256)
    private minBytes = 0
    private maxBytes = 0
    private totalBytes = 0
    private readonly steps = new Map<number, number>()
    private otherSteps = 0
    private readonly lastTimestamps = new Map<number, number>()

    note(
        ssrc: number,
        timestamp: number,
        payload: Uint8Array,
        outcome: MLowDecodeOutcome | null
    ): void {
        this.received++
        if (outcome === 'decoded') this.decoded++
        else if (outcome === 'rejected') this.rejected++

        const bytes = payload.length
        if (bytes > 0) this.firstBytes[payload[0]]++
        if (this.received === 1 || bytes < this.minBytes) this.minBytes = bytes
        if (bytes > this.maxBytes) this.maxBytes = bytes
        this.totalBytes += bytes

        const last = this.lastTimestamps.get(ssrc)
        if (last !== undefined) {
            const step = (timestamp - last) | 0
            const seen = this.steps.get(step)
            if (seen !== undefined) this.steps.set(step, seen + 1)
            else if (this.steps.size < MAX_STEPS) this.steps.set(step, 1)
            else this.otherSteps++
        }
        if (last !== undefined || this.lastTimestamps.size < MAX_STREAMS) {
            this.lastTimestamps.set(ssrc, timestamp)
        }
    }

    /** The counters, the first-byte histogram by hex value and the steps by size. */
    summary(): Record<string, unknown> {
        const firstBytes: Record<string, number> = {}
        for (let value = 0; value < 256; value++) {
            const count = this.firstBytes[value]
            if (count > 0) firstBytes[`0x${value.toString(16).padStart(2, '0')}`] = count
        }
        const timestampSteps: Record<string, number> = {}
        for (const [step, count] of this.steps) timestampSteps[String(step)] = count
        if (this.otherSteps > 0) timestampSteps.other = this.otherSteps
        return {
            packets: this.received,
            decoded: this.decoded,
            rejected: this.rejected,
            firstBytes,
            minBytes: this.minBytes,
            maxBytes: this.maxBytes,
            meanBytes: this.received > 0 ? Math.round(this.totalBytes / this.received) : 0,
            timestampSteps
        }
    }
}
