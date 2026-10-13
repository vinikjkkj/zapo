import { toError } from '../errors.js'
import { isLogLevelEnabled, type Logger } from '../logger.js'

import {
    MLOW_CHANNELS,
    MLOW_MAX_FRAME_SIZE,
    MLOW_SAMPLE_RATE,
    type MlowDecoder,
    type MlowModule
} from './mlow-binding.js'
import {
    CELT_TOC,
    MLOW_MAX_RED_BLOCKS,
    MLOW_MAX_SUBFRAMES,
    mlowFrameSamples,
    type MlowPacketRead,
    mlowPacketSamples,
    MULTIFRAME_MARKER,
    readMlowRed,
    readMlowSubframes
} from './mlow-packet.js'
import { WaMlowConcealer } from './WaMlowConcealer.js'

const SEQ_SPACE = 0x1_0000
const SEQ_HALF = 0x8000

/** Furthest behind the played audio a sub-frame may start and still be taken as a copy of it. */
const MAX_REDUNDANT_LAG = MLOW_SAMPLE_RATE

/**
 * Most of a hole one lost packet accounts for: the longest packet the decoder takes. Beyond it the
 * hole is a pause the sender took, left silent.
 */
const MAX_LOST_PACKET_SAMPLES = MLOW_MAX_FRAME_SIZE

export interface MLowCodecStats {
    /** Packets decoded normally. */
    readonly success: number
    /** Packets the decoder rejected. */
    readonly errors: number
    /** Frames rebuilt by packet loss concealment. */
    readonly plc: number
    /**
     * Frames recovered through in-band FEC. Counts accepted attempts, so it
     * over-reports: a packet holding no redundant copy yields a concealed frame
     * the decoder reports the same way.
     */
    readonly fec: number
    /** Packets dropped because the stream had already moved past them. */
    readonly late: number
    /** Gaps that were longer than `maxConcealFrames` and got truncated. */
    readonly concealCapped: number
    /** Sub-frames and in-band RED copies dropped: their stretch had already played or lost nothing. */
    readonly redundant: number
    /** Sub-frames and RED copies played in the place of a lost packet, carried by a later one. */
    readonly redRecovered: number
}

/**
 * What {@link MLowCodec.decodeSequenced} did with the packet itself, apart from the gap before it:
 * played (whole, in part, or found redundant), rejected by the decoder, late, or empty.
 */
export type MLowDecodeOutcome = 'decoded' | 'rejected' | 'late' | 'empty'

/**
 * Plays one inbound MLow stream: sequence gaps, the RTP timeline, multiframe and RED placement,
 * concealment, and decode statistics.
 */
export class WaMlowDecoder {
    private lib: MlowDecoder | null
    private readonly logger: Logger
    private readonly traceEnabled: boolean

    private readonly concealer: WaMlowConcealer

    private decodeErrors = 0
    private decodeSuccess = 0
    private lateFrames = 0
    private redundantSubframes = 0
    private redRecoveredFrames = 0

    /** Sequence position of each stream {@link decodeSequenced} numbers apart; -1 before its first. */
    private readonly lastSeqs = Int32Array.of(-1, -1)
    /** RTP timestamp where the audio played so far ends, or -1 without a timeline. */
    private playedUntil = -1
    /** New audio the last packet that followed on without a hole brought; 0 unknown. */
    private packetStep = 0

    /** Every decoded frame lands here, concealed ones too; see {@link decodeSequenced}. */
    private readonly decodeScratch = new Float32Array(MLOW_MAX_FRAME_SIZE)
    /** `[offset, length]` of each sub-frame of the packet being decoded. */
    private readonly subframeBounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    /** Timeline span of each sub-frame of the packet being decoded. */
    private readonly subframeSpans = new Int32Array(MLOW_MAX_SUBFRAMES)
    /** {@link readMlowRed} bounds of the in-band RED packet being decoded. */
    private readonly redBounds = new Int32Array((MLOW_MAX_RED_BLOCKS + 1) * 3)
    /** Span of each copy of that packet that fills a lost slot, 0 for one that does not. */
    private readonly redFills = new Int32Array(MLOW_MAX_RED_BLOCKS)

    private constructor(lib: MlowDecoder, maxConcealFrames: number | undefined, logger: Logger) {
        this.lib = lib
        this.logger = logger
        this.traceEnabled = isLogLevelEnabled(logger, 'trace')
        this.concealer = new WaMlowConcealer(lib, this.decodeScratch, maxConcealFrames, logger)
    }

    static async open(
        lib: MlowModule,
        maxConcealFrames: number | undefined,
        logger: Logger
    ): Promise<WaMlowDecoder> {
        const decoder = await lib.createDecoder({
            channels: MLOW_CHANNELS,
            sampleRate: MLOW_SAMPLE_RATE,
            useSmpl: true,
            maxFrameSize: MLOW_MAX_FRAME_SIZE
        })
        return new WaMlowDecoder(decoder, maxConcealFrames, logger)
    }

    decode(mlowFrame: Uint8Array | null): Float32Array {
        if (!this.lib) {
            throw new Error('[MLowCodec] decoder not initialized')
        }

        if (mlowFrame === null) {
            return this.concealer.conceal(this.concealer.frameSize()).slice()
        }

        const concealer = this.concealer
        return (this.tryDecode(mlowFrame) ?? concealer.silence(concealer.frameSize())).slice()
    }

    /** The `MLowCodec.decodeSequenced` contract, on this stream's decoder. */
    decodeSequenced(
        seq: number,
        packet: Uint8Array,
        onFrame: (pcm: Float32Array) => void,
        timestamp?: number,
        stream: 0 | 1 = 0,
        read?: MlowPacketRead
    ): MLowDecodeOutcome {
        if (!this.lib) {
            throw new Error('[MLowCodec] decoder not initialized')
        }
        if (packet.length === 0) {
            return 'empty'
        }

        const current = seq & 0xffff
        const lastSeq = this.lastSeqs[stream]
        let missing = 0
        if (lastSeq >= 0) {
            const delta = (current - lastSeq + SEQ_SPACE) % SEQ_SPACE
            if (delta === 0 || delta >= SEQ_HALF) {
                this.lateFrames++
                if (this.traceEnabled)
                    this.logger.trace('mlow packet arrived out of order', {
                        seq: current,
                        lastSeq,
                        stream
                    })
                return 'late'
            }
            missing = delta - 1
        }

        const onTimeline = timestamp !== undefined && this.playedUntil >= 0
        const reuse = stream === 1 && read !== undefined && read.packet === packet
        const subframeBounds = reuse ? read.subframeBounds : this.subframeBounds
        const redBounds = reuse ? read.redBounds : this.redBounds
        const subframes = reuse
            ? read.subframes
            : stream === 1
              ? readMlowSubframes(packet, subframeBounds)
              : -1
        const copies = reuse ? read.copies : subframes === 0 ? readMlowRed(packet, redBounds) : -1
        let played: boolean
        if (copies >= 0) {
            played = onTimeline
                ? this.playRedOnTimeline(
                      packet,
                      copies,
                      timestamp >>> 0,
                      missing,
                      onFrame,
                      redBounds
                  )
                : this.playRedPrimary(packet, copies, timestamp, missing, onFrame, redBounds)
        } else {
            played = onTimeline
                ? this.playOnTimeline(
                      packet,
                      timestamp >>> 0,
                      missing,
                      onFrame,
                      subframes,
                      subframeBounds
                  )
                : this.playWhole(packet, timestamp, missing, onFrame, subframes, subframeBounds)
        }
        this.lastSeqs[stream] = played ? current : (current - 1 + SEQ_SPACE) % SEQ_SPACE
        return played ? 'decoded' : 'rejected'
    }

    resetSequence(): void {
        this.lastSeqs.fill(-1)
        this.concealer.resetFrameSize()
        this.playedUntil = -1
        this.packetStep = 0
        if (this.lib?.hasCompanion) {
            this.lib.resetCompanion()
        }
    }

    setCompanionModel(model: Uint8Array): void {
        this.lib?.setCompanionModel(model)
    }

    getStats(): MLowCodecStats {
        return {
            success: this.decodeSuccess,
            errors: this.decodeErrors,
            plc: this.concealer.plc,
            fec: this.concealer.fec,
            late: this.lateFrames,
            concealCapped: this.concealer.capped,
            redundant: this.redundantSubframes,
            redRecovered: this.redRecoveredFrames
        }
    }

    /** Frees the library decoder; the statistics stay readable. */
    free(): void {
        this.lib?.free()
        this.lib = null
        this.concealer.free()
    }

    /**
     * Decodes `packet` whole after concealing what `missing` packets left. With `timestamp` it
     * opens the timeline the next packets are placed on. False when the decoder rejects it.
     */
    private playWhole(
        packet: Uint8Array,
        timestamp: number | undefined,
        missing: number,
        onFrame: (pcm: Float32Array) => void,
        subframes = -1,
        bounds: Int32Array = this.subframeBounds
    ): boolean {
        if (missing > 0) {
            this.concealer.concealGap(missing, packet, onFrame)
        }
        const decoded = this.tryDecode(packet)
        if (decoded === null) {
            return false
        }
        if (timestamp === undefined) {
            this.playedUntil = -1
        } else {
            const count = this.splitOnTimeline(packet, subframes, bounds)
            let span = count === 0 ? decoded.length : 0
            for (let index = 0; index < count; index++) span += this.subframeSpans[index]
            this.playedUntil = (timestamp + span) >>> 0
        }
        onFrame(decoded)
        return true
    }

    /**
     * Drops the leading sub-frames whose stretch of the timeline already played, conceals the
     * hole a loss left before the first new one, and decodes from there. False when rejected.
     */
    private playOnTimeline(
        packet: Uint8Array,
        timestamp: number,
        missing: number,
        onFrame: (pcm: Float32Array) => void,
        subframes = -1,
        bounds: Int32Array = this.subframeBounds
    ): boolean {
        const decoder = this.lib
        const count = this.splitOnTimeline(packet, subframes, bounds)
        if (!decoder || count === 0) {
            return this.playWhole(packet, timestamp, missing, onFrame)
        }

        const played = this.playedUntil
        let start = timestamp
        let first = 0
        while (first < count) {
            const end = (start + this.subframeSpans[first]) >>> 0
            if (((played - end) | 0) < 0 || ((played - start) | 0) > MAX_REDUNDANT_LAG) break
            start = end
            first++
        }
        if (first === count) {
            this.redundantSubframes += count
            return true
        }

        const hole = (start - played) | 0
        if (missing > 0 && hole > 0) {
            this.concealUntil(start, missing * MAX_LOST_PACKET_SAMPLES, packet, onFrame)
        }
        const recovered =
            missing > 0 ? this.countCopiesInHole(start, played, first, count, missing) : 0

        let samples = 0
        try {
            if (first === 0) {
                samples = decoder.decodeFloatInto(this.decodeScratch, packet)
            } else {
                for (let index = first; index < count; index++) {
                    const offset = bounds[index * 2]
                    samples += decoder.decodeFloatInto(
                        this.decodeScratch.subarray(samples),
                        packet.subarray(offset, offset + bounds[index * 2 + 1])
                    )
                }
            }
        } catch (err) {
            this.decodeErrors++
            if (this.traceEnabled)
                this.logger.trace('mlow decode failed', { message: toError(err).message })
            return false
        }

        let end = start
        for (let index = first; index < count; index++) {
            end = (end + this.subframeSpans[index]) >>> 0
        }
        this.decodeSuccess++
        this.redundantSubframes += first
        this.redRecoveredFrames += recovered
        this.concealer.noteDecoded(samples)
        if (missing === 0 && hole === 0) {
            this.packetStep = (end - played) >>> 0
        }
        this.playedUntil = end
        onFrame(this.decodeScratch.subarray(0, samples))
        return true
    }

    /** Plays the primary of an in-band RED packet whole, its `copies` dropped as redundant. */
    private playRedPrimary(
        packet: Uint8Array,
        copies: number,
        timestamp: number | undefined,
        missing: number,
        onFrame: (pcm: Float32Array) => void,
        bounds: Int32Array = this.redBounds
    ): boolean {
        this.redundantSubframes += copies
        return this.playWhole(packet.subarray(bounds[copies * 3]), timestamp, missing, onFrame)
    }

    /**
     * Plays an in-band RED packet: a copy only where a loss left its slot unplayed, then the
     * primary; with no such copy the primary goes through {@link playOnTimeline}. False if rejected.
     */
    private playRedOnTimeline(
        packet: Uint8Array,
        copies: number,
        timestamp: number,
        missing: number,
        onFrame: (pcm: Float32Array) => void,
        bounds: Int32Array
    ): boolean {
        const decoder = this.lib
        const primary = packet.subarray(bounds[copies * 3])
        const primarySpan = mlowPacketSamples(primary, this.subframeBounds)
        if (!decoder || primarySpan === 0) {
            return this.playRedPrimary(packet, copies, timestamp, missing, onFrame, bounds)
        }

        let cursor = this.playedUntil
        let used = 0
        for (let index = 0; index < copies; index++) {
            const offset = bounds[index * 3]
            const start = (timestamp - bounds[index * 3 + 2]) >>> 0
            const span =
                missing > 0
                    ? mlowPacketSamples(
                          packet.subarray(offset, offset + bounds[index * 3 + 1]),
                          this.subframeBounds
                      )
                    : 0
            const fills =
                span > 0 && ((start - cursor) | 0) >= 0 && ((timestamp - start - span) | 0) >= 0
            this.redFills[index] = fills ? span : 0
            if (!fills) continue
            cursor = (start + span) >>> 0
            used++
        }
        if (used === 0) {
            this.redundantSubframes += copies
            return this.playOnTimeline(primary, timestamp, missing, onFrame)
        }

        let budget = missing * MAX_LOST_PACKET_SAMPLES
        let samples = 0
        try {
            for (let index = 0; index < copies; index++) {
                if (this.redFills[index] === 0) continue
                const start = (timestamp - bounds[index * 3 + 2]) >>> 0
                budget -= this.concealUntil(start, budget, null, onFrame)
                const offset = bounds[index * 3]
                const copySamples = decoder.decodeFloatInto(
                    this.decodeScratch,
                    packet.subarray(offset, offset + bounds[index * 3 + 1])
                )
                this.playedUntil = (start + this.redFills[index]) >>> 0
                budget -= this.redFills[index]
                onFrame(this.decodeScratch.subarray(0, copySamples))
            }
            this.concealUntil(timestamp, budget, primary, onFrame)
            samples = decoder.decodeFloatInto(this.decodeScratch, primary)
        } catch (err) {
            this.decodeErrors++
            if (this.traceEnabled)
                this.logger.trace('mlow decode failed', { message: toError(err).message })
            return false
        }

        const end = (timestamp + primarySpan) >>> 0
        this.decodeSuccess++
        this.redundantSubframes += copies - used
        this.redRecoveredFrames += used
        this.concealer.noteDecoded(samples)
        this.playedUntil = end
        onFrame(this.decodeScratch.subarray(0, samples))
        return true
    }

    /**
     * Splits `packet` into {@link subframeBounds} with each sub-frame's span in
     * {@link subframeSpans}; 0 for a malformed multiframe or a CELT frame, which have no span.
     * `subframes` is a {@link readMlowSubframes} count already in the bounds, or -1 to read it.
     */
    private splitOnTimeline(
        packet: Uint8Array,
        subframes = -1,
        bounds: Int32Array = this.subframeBounds
    ): number {
        let count = subframes >= 0 ? subframes : readMlowSubframes(packet, bounds)
        if (count === 0) {
            const marker = packet[0]
            if ((marker & MULTIFRAME_MARKER) === MULTIFRAME_MARKER && marker < CELT_TOC) return 0
            bounds[0] = 0
            bounds[1] = packet.length
            count = 1
        }
        for (let index = 0; index < count; index++) {
            const span = mlowFrameSamples(packet[bounds[index * 2]])
            if (span === 0) return 0
            this.subframeSpans[index] = span
        }
        return count
    }

    /** Sub-frames from `first` inside the lost packets' own stretch: copies standing in for them. */
    private countCopiesInHole(
        start: number,
        played: number,
        first: number,
        count: number,
        missing: number
    ): number {
        if (this.packetStep <= 0) {
            return 0
        }
        const lost = missing * this.packetStep
        let copies = 0
        let at = start
        for (let index = first; index < count && ((at - played) | 0) < lost; index++) {
            copies++
            at = (at + this.subframeSpans[index]) >>> 0
        }
        return copies
    }

    /**
     * Conceals from `playedUntil` up to `until`, `budget` samples at most; the FEC of `fecPacket`,
     * which sits right before it, only when the span reaches `until`. Returns the samples emitted.
     */
    private concealUntil(
        until: number,
        budget: number,
        fecPacket: Uint8Array | null,
        onFrame: (pcm: Float32Array) => void
    ): number {
        const hole = (until - this.playedUntil) | 0
        if (hole <= 0 || budget <= 0) return 0
        const reaches = hole <= budget
        const concealed = this.concealer.concealSpan(
            reaches ? hole : budget,
            reaches ? fecPacket : null,
            onFrame
        )
        this.playedUntil = (this.playedUntil + concealed) >>> 0
        return concealed
    }

    /** Decode one packet against the live decoder, or `null` if it was rejected. */
    private tryDecode(mlowFrame: Uint8Array): Float32Array | null {
        if (!this.lib) {
            return null
        }
        try {
            const samples = this.lib.decodeFloatInto(this.decodeScratch, mlowFrame)
            this.decodeSuccess++
            this.concealer.noteDecoded(samples)
            return this.decodeScratch.subarray(0, samples)
        } catch (err) {
            this.decodeErrors++
            if (this.traceEnabled)
                this.logger.trace('mlow decode failed', { message: toError(err).message })
            return null
        }
    }
}
