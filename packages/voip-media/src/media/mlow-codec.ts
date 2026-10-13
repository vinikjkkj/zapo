import { toError } from '../errors.js'
import { createNoopLogger, isLogLevelEnabled, type Logger } from '../logger.js'

const MLOW_SAMPLE_RATE = 16_000 as const
const MLOW_CHANNELS = 1 as const
const FRAME_SIZE = 960
const MAX_FRAME_SIZE = 1_920

/** The library's ceiling on one encoded packet, and the size an encode target needs. */
export const MLOW_MAX_PACKET_BYTES = 4_000

const APPLICATION_VOIP = 2048
const SIGNAL_VOICE = 3001

/**
 * Smallest concealment unit the codec library accepts (2.5 ms). PLC and FEC
 * lengths must be whole multiples of it, capped at `MAX_FRAME_SIZE` (120 ms).
 */
const CONCEAL_QUANTUM = MLOW_SAMPLE_RATE / 400

const DEFAULT_BITRATE = 15_000
const DEFAULT_COMPLEXITY = 5
const DEFAULT_MAX_CONCEAL_FRAMES = 5

/** The client's own defaults for the RED secondary encoder. */
const DEFAULT_RED_SECONDARY_BITRATE = 4_200
const DEFAULT_RED_SECONDARY_COMPLEXITY = 5

const SEQ_SPACE = 0x1_0000
const SEQ_HALF = 0x8000

/** Multiframe packet: `[0x82 | toc & 0x39][count][count - 1 lengths][sub-frames, each with its TOC]`. */
const MULTIFRAME_MARKER = 0x82
const MULTIFRAME_COUNT_MASK = 0x3f
/** Most sub-frames one multiframe packet carries. */
export const MLOW_MAX_SUBFRAMES = 18
/** A TOC with both top bits set selects CELT, whose low bits mean something else. */
const CELT_TOC = 0xc0

/** TOC bit 6: the frame carries speech. Clear on the silence and DTX frames. */
export const MLOW_TOC_VAD = 0x40

/** Samples on the 16 kHz RTP clock of an SMPL frame, by TOC bits 4-3: 10, 20, 60 or 120 ms. */
const SMPL_FRAME_SAMPLES = [160, 320, 960, 1_920] as const

/** Furthest behind the played audio a sub-frame may start and still be taken as a copy of it. */
const MAX_REDUNDANT_LAG = MLOW_SAMPLE_RATE

/**
 * Most of a hole one lost packet accounts for: the longest packet the decoder takes. Beyond it the
 * hole is a pause the sender took, left silent.
 */
const MAX_LOST_PACKET_SAMPLES = MAX_FRAME_SIZE

/** First byte of an in-band RED copy header: F (bit 7) set, the low 7 bits how far back in 10 ms. */
const RED_COPY_MARKER = 0x80
/** The primary's header, F clear: one byte that closes the header list. */
const RED_PRIMARY_HEADER = 0x00
const RED_DELTA_MASK = 0x7f
/** 16 kHz samples in one 10 ms step of the header: 0x86 is the frame 60 ms before. */
const RED_DELTA_UNIT = MLOW_SAMPLE_RATE / 100
/** Furthest back a copy may start, in 16 kHz samples: 127 steps, 1270 ms. */
const RED_MAX_DELTA = RED_DELTA_MASK * RED_DELTA_UNIT
/** Longest copy the header's length byte describes. */
const RED_MAX_COPY_BYTES = 0xff
/** Most copies an in-band RED packet carries, a bound of ours. */
export const MLOW_MAX_RED_BLOCKS = 8

/**
 * MLow-specific encoder control requests. The WhatsApp client writes all four,
 * but neither their meaning nor the values it writes are known, so they stay
 * unset unless a caller supplies one.
 */
export const MLOW_ENCODER_CTL = Object.freeze({
    /** `OPUS_SET_MLOW_SUBFRAME_IMP` */
    SUBFRAME_IMPORTANCE: 4060,
    /** `OPUS_SET_MLOW_USE_SP_ACT_FLAT` */
    USE_SPEECH_ACTIVITY_FLATNESS: 4062,
    /** `OPUS_SET_MLOW_VAD_NON_BINARY` */
    VAD_NON_BINARY: 4066,
    /** `OPUS_SET_MLOW_VAD_HP_SHARPNESS` */
    VAD_HIGHPASS_SHARPNESS: 4068
} as const)

/**
 * Raw values for the requests in {@link MLOW_ENCODER_CTL}, written verbatim; an
 * absent field leaves the encoder default in place. A value outside the ranges
 * below is reported as a warning, not thrown.
 */
export interface MLowEncoderTunables {
    /** {@link MLOW_ENCODER_CTL.SUBFRAME_IMPORTANCE}, 0 to 300. */
    readonly subframeImportance?: number
    /** {@link MLOW_ENCODER_CTL.USE_SPEECH_ACTIVITY_FLATNESS}, 0 or 1. */
    readonly useSpeechActivityFlatness?: number
    /** {@link MLOW_ENCODER_CTL.VAD_NON_BINARY}, 0 to 100. */
    readonly vadNonBinary?: number
    /** {@link MLOW_ENCODER_CTL.VAD_HIGHPASS_SHARPNESS}, 0 to 100. */
    readonly vadHighpassSharpness?: number
}

/**
 * The MLow Companion's weights: the `DNNw` container WhatsApp downloads at runtime
 * (`mlow_companion_v1`), as bytes or as a loader called each time the codec loads.
 */
export type MLowCompanionModelSource =
    | Uint8Array
    | ArrayBuffer
    | (() => Promise<Uint8Array | ArrayBuffer>)

/** The RED secondary encoder. Unset fields take the client's defaults, 4200 bps and complexity 5. */
export interface MLowRedOptions {
    readonly secondaryBitrate?: number
    readonly secondaryComplexity?: number
}

interface MlowDecodeOptions {
    readonly decodeFec?: boolean
    readonly frameSize?: number
    readonly maxFrameSize?: number
}

interface MlowEncoder {
    encodeInto(pcm: Int16Array, target: Uint8Array): number
    encodeSecondary(): Uint8Array
    setSecondaryBitrate(bitrate: number): void
    setSecondaryComplexity(complexity: number): void
    encoderCtl(request: number, value: number): void
    setPacketLossPercent(percentage: number): void
    free(): void
}

interface MlowDecoder {
    decodeFloatInto(
        target: Float32Array,
        packet: Uint8Array | null,
        options?: MlowDecodeOptions
    ): number
    readonly hasCompanion: boolean
    setCompanionModel(model: Uint8Array | null): void
    resetCompanion(): void
    free(): void
}

interface MlowRepacketizer {
    pack(frames: readonly Uint8Array[]): Uint8Array
    free(): void
}

interface MlowModule {
    loadLibopus(): Promise<{ version: string }>
    createEncoder(options?: Record<string, unknown>): Promise<MlowEncoder>
    createDecoder(options?: Record<string, unknown>): Promise<MlowDecoder>
    createRepacketizer(): Promise<MlowRepacketizer>
}

let wasmReady: Promise<MlowModule> | null = null

function loadMlowModule(): Promise<MlowModule> {
    if (!wasmReady) {
        wasmReady = import('libmlow-wasm-fork')
            .then(async (mod) => {
                const lib = mod as unknown as MlowModule
                await lib.loadLibopus()
                return lib
            })
            .catch((err) => {
                wasmReady = null
                throw err
            })
    }
    return wasmReady
}

/**
 * Splits a multiframe packet into `bounds` as `[offset, length]` pairs and returns the sub-frame
 * count, or 0 for a single frame or a header that does not add up.
 */
function readMlowSubframes(packet: Uint8Array, bounds: Int32Array): number {
    const marker = packet[0]
    if (packet.length < 3 || (marker & MULTIFRAME_MARKER) !== MULTIFRAME_MARKER) return 0
    if (marker >= CELT_TOC) return 0
    const count = packet[1] & MULTIFRAME_COUNT_MASK
    if (count < 2 || count > MLOW_MAX_SUBFRAMES || bounds.length < count * 2) return 0

    let cursor = 2
    let total = 0
    for (let index = 0; index < count - 1; index++) {
        if (cursor >= packet.length) return 0
        let length = packet[cursor++]
        if (length >= 252) {
            if (cursor >= packet.length) return 0
            length += packet[cursor++] * 4
        }
        if (length === 0) return 0
        bounds[index * 2 + 1] = length
        total += length
    }
    if (cursor + total >= packet.length) return 0

    let offset = cursor
    for (let index = 0; index < count - 1; index++) {
        bounds[index * 2] = offset
        offset += bounds[index * 2 + 1]
    }
    bounds[(count - 1) * 2] = offset
    bounds[(count - 1) * 2 + 1] = packet.length - offset
    return count
}

/** Samples a frame spans on the 16 kHz RTP clock, read from its TOC; 0 for a CELT TOC. */
function mlowFrameSamples(toc: number): number {
    return toc >= CELT_TOC ? 0 : SMPL_FRAME_SAMPLES[(toc >> 3) & 3]
}

/**
 * Samples `packet` spans, its sub-frames summed, with `bounds` as {@link readMlowSubframes} fills
 * it; 0 when it does not parse as MLow: empty, a CELT TOC, or a multiframe that does not add up.
 */
export function mlowPacketSamples(packet: Uint8Array, bounds: Int32Array): number {
    if (packet.length === 0) return 0
    return samplesOfSubframes(packet, readMlowSubframes(packet, bounds), bounds)
}

/** {@link mlowPacketSamples} of a packet whose {@link readMlowSubframes} count is in `bounds`. */
function samplesOfSubframes(packet: Uint8Array, count: number, bounds: Int32Array): number {
    if (packet.length === 0) return 0
    if (count === 0) {
        const marker = packet[0]
        if ((marker & MULTIFRAME_MARKER) === MULTIFRAME_MARKER && marker < CELT_TOC) return 0
        return mlowFrameSamples(marker)
    }
    let samples = 0
    for (let index = 0; index < count; index++) {
        const span = mlowFrameSamples(packet[bounds[index * 2]])
        if (span === 0) return 0
        samples += span
    }
    return samples
}

/** A RED copy header's first byte: F set and a non-zero step back. */
function isRedHeader(byte: number): boolean {
    return (byte & RED_COPY_MARKER) !== 0 && (byte & RED_DELTA_MASK) !== 0
}

/** Δts of a copy a RED header can carry, or 0 when the copy is left out. */
function redCopyDelta(copy: Uint8Array, timestamp: number, copyTimestamp: number): number {
    const delta = (timestamp - copyTimestamp) >>> 0
    if (copy.length === 0 || copy.length > RED_MAX_COPY_BYTES) return 0
    if (delta % RED_DELTA_UNIT !== 0) return 0
    return delta < RED_DELTA_UNIT || delta > RED_MAX_DELTA ? 0 : delta
}

/**
 * Writes the official in-band MLow RED, a compact RFC 2198, into `target` and returns
 * its length: `[0x80 | steps][length]` per copy, the `0x00` primary header, the copies, then
 * `primary`. Steps are 10 ms units back from `timestamp`, 1 to 127; a copy empty, over 255 bytes or
 * off that grid is left out. Goes on PT 121; the receiver needs `enable_red_pt_support_rx`.
 */
export function writeMlowRed(
    target: Uint8Array,
    primary: Uint8Array,
    timestamp: number,
    copies: readonly Uint8Array[],
    copyTimestamps: readonly number[]
): number {
    let body = 1
    for (let index = 0; index < copies.length; index++) {
        if (redCopyDelta(copies[index], timestamp, copyTimestamps[index]) > 0) body += 2
    }
    let header = 0
    for (let index = 0; index < copies.length; index++) {
        const copy = copies[index]
        const delta = redCopyDelta(copy, timestamp, copyTimestamps[index])
        if (delta === 0) continue
        target[header++] = RED_COPY_MARKER | Math.floor(delta / RED_DELTA_UNIT)
        target[header++] = copy.length
        target.set(copy, body)
        body += copy.length
    }
    target[header] = RED_PRIMARY_HEADER
    target.set(primary, body)
    return body + primary.length
}

/**
 * Splits the in-band RED of {@link writeMlowRed} into `bounds`, `[offset, length, Δts]` per copy,
 * Δts its 10 ms steps as 16 kHz samples, then the primary's `[offset, length]`. Returns the copy
 * count, 0 for a lone primary, -1 when `packet` is not RED: headers while F is set, then `0x00`.
 */
export function readMlowRed(packet: Uint8Array, bounds: Int32Array): number {
    let count = 0
    let cursor = 0
    let total = 0
    while (cursor < packet.length && isRedHeader(packet[cursor])) {
        if (cursor + 1 >= packet.length || count === MLOW_MAX_RED_BLOCKS) return -1
        if (bounds.length < (count + 2) * 3) return -1
        const length = packet[cursor + 1]
        if (length === 0) return -1
        bounds[count * 3 + 1] = length
        bounds[count * 3 + 2] = (packet[cursor] & RED_DELTA_MASK) * RED_DELTA_UNIT
        total += length
        cursor += 2
        count++
    }
    if (cursor >= packet.length || packet[cursor] !== RED_PRIMARY_HEADER) return -1
    cursor++
    if (cursor + total >= packet.length || bounds.length < (count + 1) * 3) return -1

    for (let index = 0; index < count; index++) {
        bounds[index * 3] = cursor
        cursor += bounds[index * 3 + 1]
    }
    bounds[count * 3] = cursor
    bounds[count * 3 + 1] = packet.length - cursor
    bounds[count * 3 + 2] = 0
    return count
}

/** One read of a PT 121 packet, kept so {@link MLowCodec.decodeSequenced} does not read it again. */
export class MlowPacketRead {
    readonly subframeBounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    readonly redBounds = new Int32Array((MLOW_MAX_RED_BLOCKS + 1) * 3)
    packet: Uint8Array | null = null
    subframes = 0
    copies = -1

    /** Reads `packet`; whether it parses as MLow, as frames with a span or as in-band RED. */
    read(packet: Uint8Array): boolean {
        const subframes = readMlowSubframes(packet, this.subframeBounds)
        this.packet = packet
        this.subframes = subframes
        this.copies = subframes === 0 ? readMlowRed(packet, this.redBounds) : -1
        if (samplesOfSubframes(packet, subframes, this.subframeBounds) > 0) return true
        return subframes === 0 ? this.copies >= 0 : readMlowRed(packet, this.redBounds) >= 0
    }
}

export interface MLowCodecOptions {
    /** Encoder bitrate in bps, default 15000; `<voip_settings>` may hand down another rung. */
    readonly bitrate?: number
    /** Encoder complexity, 0 to 10, default 5. */
    readonly complexity?: number
    /** In-band FEC, default `true`; it only emits while {@link packetLossPercent} is above 0. */
    readonly fec?: boolean
    /** Loss the encoder protects against, 0 to 100, default 0. */
    readonly packetLossPercent?: number
    /** Most concealment frames for one gap, default 5; a longer outage goes silent. */
    readonly maxConcealFrames?: number
    /** MLow-specific encoder control requests. Unset requests are not written. */
    readonly tunables?: MLowEncoderTunables
    /** The MLow Companion's weights; ones that fail to load are skipped with a warning. */
    readonly companionModel?: MLowCompanionModelSource
    /** Runs the RED secondary encoder, its copy in {@link MLowCodec.lastSecondary}; DTX goes off. */
    readonly red?: boolean | MLowRedOptions
    /** Builds the decoder alone, for one inbound stream of a group call: encode and pack throw. */
    readonly decodeOnly?: boolean
    readonly logger?: Logger
}

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

/** The RED settings the options ask for, or `null` when RED stays off. */
function resolveRed(red: MLowCodecOptions['red']): Required<MLowRedOptions> | null {
    if (!red) return null
    const options = red === true ? {} : red
    return {
        secondaryBitrate: options.secondaryBitrate ?? DEFAULT_RED_SECONDARY_BITRATE,
        secondaryComplexity: options.secondaryComplexity ?? DEFAULT_RED_SECONDARY_COMPLEXITY
    }
}

export class MLowCodec {
    private encoder: MlowEncoder | null = null
    private decoder: MlowDecoder | null = null
    private repacketizer: MlowRepacketizer | null = null
    private logger: Logger = createNoopLogger()
    private traceEnabled = false

    private decodeErrors = 0
    private decodeSuccess = 0
    private plcFrames = 0
    private fecFrames = 0
    private lateFrames = 0
    private concealCapped = 0
    private redundantSubframes = 0
    private redRecoveredFrames = 0

    private packetLossPercent = 0
    private maxConcealFrames = DEFAULT_MAX_CONCEAL_FRAMES
    private red = false
    private secondary: Uint8Array | null = null

    /** Sequence position of each stream {@link decodeSequenced} numbers apart; -1 before its first. */
    private readonly lastSeqs = Int32Array.of(-1, -1)
    private lastDecodedSamples = 0
    /** RTP timestamp where the audio played so far ends, or -1 without a timeline. */
    private playedUntil = -1
    /** New audio the last packet that followed on without a hole brought; 0 unknown. */
    private packetStep = 0

    /** Reused PCM staging buffer for the encoder, one full frame wide. */
    private readonly pcmScratch = new Int16Array(FRAME_SIZE)
    /** Encode target behind {@link encode}, which hands back a copy. */
    private readonly packetScratch = new Uint8Array(MLOW_MAX_PACKET_BYTES)
    /** Every decoded frame lands here; see {@link decodeSequenced}. */
    private readonly decodeScratch = new Float32Array(MAX_FRAME_SIZE)
    /** `[offset, length]` of each sub-frame of the packet being decoded. */
    private readonly subframeBounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    /** Timeline span of each sub-frame of the packet being decoded. */
    private readonly subframeSpans = new Int32Array(MLOW_MAX_SUBFRAMES)
    /** {@link readMlowRed} bounds of the in-band RED packet being decoded. */
    private readonly redBounds = new Int32Array((MLOW_MAX_RED_BLOCKS + 1) * 3)
    /** Span of each copy of that packet that fills a lost slot, 0 for one that does not. */
    private readonly redFills = new Int32Array(MLOW_MAX_RED_BLOCKS)
    /** Shared read-only zero frame handed out when a decode cannot be salvaged. */
    private readonly silenceScratch = new Float32Array(MAX_FRAME_SIZE)

    private constructor() {}

    static async create(opts: MLowCodecOptions = {}): Promise<MLowCodec> {
        const codec = new MLowCodec()
        await codec.init(opts)
        return codec
    }

    private async init(opts: MLowCodecOptions): Promise<void> {
        this.logger = opts.logger ?? createNoopLogger()
        this.traceEnabled = isLogLevelEnabled(this.logger, 'trace')
        this.packetLossPercent = clampPercent(opts.packetLossPercent ?? 0)
        const requestedConcealFrames = opts.maxConcealFrames
        this.maxConcealFrames = Math.max(
            0,
            Math.trunc(
                Number.isFinite(requestedConcealFrames)
                    ? (requestedConcealFrames as number)
                    : DEFAULT_MAX_CONCEAL_FRAMES
            )
        )
        const red = resolveRed(opts.red)

        const lib = await loadMlowModule()

        this.decoder = await lib.createDecoder({
            channels: MLOW_CHANNELS,
            sampleRate: MLOW_SAMPLE_RATE,
            useSmpl: true,
            maxFrameSize: MAX_FRAME_SIZE
        })

        try {
            if (opts.companionModel !== undefined) {
                await this.attachCompanion(opts.companionModel)
            }
            if (opts.decodeOnly) {
                return
            }
            this.encoder = await lib.createEncoder({
                channels: MLOW_CHANNELS,
                sampleRate: MLOW_SAMPLE_RATE,
                application: APPLICATION_VOIP,
                frameSize: FRAME_SIZE,
                useSmpl: true,
                // The secondary encoder aborts the shared WASM module on a DTX frame.
                dtx: red === null,
                fec: opts.fec ?? true,
                packetLossPercent: this.packetLossPercent,
                bitrate: opts.bitrate ?? DEFAULT_BITRATE,
                complexity: opts.complexity ?? DEFAULT_COMPLEXITY,
                signal: SIGNAL_VOICE
            })
            this.repacketizer = await lib.createRepacketizer()
        } catch (err) {
            this.destroy()
            throw err
        }

        if (red) {
            this.enableRed(red)
        }
        if (opts.tunables) {
            this.applyEncoderTunables(opts.tunables)
        }
    }

    encode(float32Audio: Float32Array): Uint8Array {
        const length = this.encodeInto(float32Audio, this.packetScratch)
        return this.packetScratch.slice(0, length)
    }

    /**
     * Encodes one frame into `target` and returns its byte count; `target` needs
     * {@link MLOW_MAX_PACKET_BYTES}. With RED on, the frame's redundant copy is then
     * {@link lastSecondary}.
     */
    encodeInto(float32Audio: Float32Array, target: Uint8Array): number {
        const encoder = this.encoder
        if (!encoder) {
            throw new Error('[MLowCodec] encoder not initialized')
        }
        if (float32Audio.length !== FRAME_SIZE) {
            throw new Error(
                `[MLowCodec] encode expects ${FRAME_SIZE} samples, got ${float32Audio.length}`
            )
        }
        this.secondary = null
        const pcm = this.pcmScratch
        for (let i = 0; i < pcm.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Audio[i]))
            pcm[i] = Math.round(sample * 32_767)
        }
        const length = encoder.encodeInto(pcm, target)
        if (this.red) {
            this.encodeSecondary(encoder)
        }
        return length
    }

    /** Whether RED runs: every encode then yields a redundant copy. */
    get redActive(): boolean {
        return this.red
    }

    /** RED copy of the frame the last encode took, a fresh array, or `null` with RED off. */
    get lastSecondary(): Uint8Array | null {
        return this.secondary
    }

    /** Packs encoded frames into one multiframe packet, a fresh array. */
    packFrames(frames: readonly Uint8Array[]): Uint8Array {
        if (!this.repacketizer) {
            throw new Error('[MLowCodec] repacketizer not initialized')
        }
        return this.repacketizer.pack(frames)
    }

    /**
     * Decode a single packet. `null` runs packet loss concealment for one
     * frame instead. Prefer {@link MLowCodec.decodeSequenced} on a live stream:
     * it detects the gaps this entry point cannot see.
     */
    decode(mlowFrame: Uint8Array | null): Float32Array {
        if (!this.decoder) {
            throw new Error('[MLowCodec] decoder not initialized')
        }

        if (mlowFrame === null) {
            return this.conceal(this.concealFrameSize()).slice()
        }

        return (this.tryDecode(mlowFrame) ?? this.silence(this.concealFrameSize())).slice()
    }

    /**
     * Decodes one inbound packet by its RTP sequence number and hands every PCM frame to
     * `onFrame`, oldest first, as a view valid only during the callback. Gaps are filled first:
     * the frame right before from the packet's FEC, older ones by PLC, up to `maxConcealFrames`.
     * With `timestamp`, sub-frames are placed on the RTP timeline: one whose stretch already
     * played is dropped, one landing in a lost packet's hole plays in its place. `stream` 1
     * (PT 121) numbers its own gaps and may carry in-band RED ({@link readMlowRed}). A rejected
     * packet advances its stream to just behind it, leaving only its own slot to the next FEC.
     * `read`, when it holds this packet, stands in for reading the PT 121 layout again.
     */
    decodeSequenced(
        seq: number,
        packet: Uint8Array,
        onFrame: (pcm: Float32Array) => void,
        timestamp?: number,
        stream: 0 | 1 = 0,
        read?: MlowPacketRead
    ): MLowDecodeOutcome {
        if (!this.decoder) {
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

    /**
     * Forget the inbound sequence position, for example after an SSRC change. The
     * Companion's recurrent state restarts with it.
     */
    resetSequence(): void {
        this.lastSeqs.fill(-1)
        this.lastDecodedSamples = 0
        this.playedUntil = -1
        this.packetStep = 0
        if (this.decoder?.hasCompanion) {
            this.decoder.resetCompanion()
        }
    }

    /**
     * Tell the encoder how much loss to protect against, 0 to 100. FEC only
     * emits a redundant copy while this is above zero.
     */
    setExpectedPacketLossPercent(percent: number): void {
        const next = clampPercent(percent)
        if (next === this.packetLossPercent) {
            return
        }
        this.packetLossPercent = next
        if (!this.encoder) {
            return
        }
        try {
            this.encoder.setPacketLossPercent(next)
        } catch (err) {
            this.logger.warn('mlow packet loss percent rejected', {
                percent: next,
                message: toError(err).message
            })
        }
    }

    /** Writes the requests in {@link MLOW_ENCODER_CTL}; absent fields are left untouched. */
    private applyEncoderTunables(tunables: MLowEncoderTunables): void {
        if (!this.encoder) {
            throw new Error('[MLowCodec] encoder not initialized')
        }
        this.writeCtl(MLOW_ENCODER_CTL.SUBFRAME_IMPORTANCE, tunables.subframeImportance)
        this.writeCtl(
            MLOW_ENCODER_CTL.USE_SPEECH_ACTIVITY_FLATNESS,
            tunables.useSpeechActivityFlatness
        )
        this.writeCtl(MLOW_ENCODER_CTL.VAD_NON_BINARY, tunables.vadNonBinary)
        this.writeCtl(MLOW_ENCODER_CTL.VAD_HIGHPASS_SHARPNESS, tunables.vadHighpassSharpness)
    }

    getStats(): MLowCodecStats {
        return {
            success: this.decodeSuccess,
            errors: this.decodeErrors,
            plc: this.plcFrames,
            fec: this.fecFrames,
            late: this.lateFrames,
            concealCapped: this.concealCapped,
            redundant: this.redundantSubframes,
            redRecovered: this.redRecoveredFrames
        }
    }

    getFrameSize(): number {
        return FRAME_SIZE
    }

    destroy(): void {
        this.encoder?.free()
        this.decoder?.free()
        this.repacketizer?.free()
        this.encoder = null
        this.decoder = null
        this.repacketizer = null
        this.red = false
        this.secondary = null
    }

    private async attachCompanion(source: MLowCompanionModelSource): Promise<void> {
        try {
            const model = typeof source === 'function' ? await source() : source
            this.decoder?.setCompanionModel(
                model instanceof Uint8Array ? model : new Uint8Array(model)
            )
        } catch (err) {
            this.logger.warn('mlow companion unavailable, decoding without it', {
                message: toError(err).message
            })
        }
    }

    /** DTX stays off on a failure: turning it back on is the call that can abort the module. */
    private enableRed(red: Required<MLowRedOptions>): void {
        try {
            this.encoder?.setSecondaryBitrate(red.secondaryBitrate)
            this.encoder?.setSecondaryComplexity(red.secondaryComplexity)
            this.red = this.encoder !== null
        } catch (err) {
            this.logger.warn('mlow red unavailable, sending without it', {
                message: toError(err).message
            })
        }
    }

    private encodeSecondary(encoder: MlowEncoder): void {
        try {
            this.secondary = encoder.encodeSecondary()
        } catch (err) {
            // The secondary has to follow every frame, so one miss ends RED for this encoder.
            this.red = false
            this.logger.warn('mlow red secondary failed, sending without it', {
                message: toError(err).message
            })
        }
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
            this.concealGap(missing, packet, onFrame)
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
        const decoder = this.decoder
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
        if (samples > 0) {
            this.lastDecodedSamples = samples
        }
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
        const decoder = this.decoder
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
        if (samples > 0) {
            this.lastDecodedSamples = samples
        }
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
        const concealed = this.concealSpan(
            reaches ? hole : budget,
            reaches ? fecPacket : null,
            onFrame
        )
        this.playedUntil = (this.playedUntil + concealed) >>> 0
        return concealed
    }

    /**
     * Conceals `samples` in steps no longer than the last decoded frame, `maxConcealFrames` at
     * most, the step that ends the span from `fecPacket`'s FEC when given; returns those emitted.
     */
    private concealSpan(
        samples: number,
        fecPacket: Uint8Array | null,
        onFrame: (pcm: Float32Array) => void
    ): number {
        const step = this.concealFrameSize()
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
    private concealGap(
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

        const frameSize = this.concealFrameSize()
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

    /** Decode one packet against the live decoder, or `null` if it was rejected. */
    private tryDecode(mlowFrame: Uint8Array): Float32Array | null {
        if (!this.decoder) {
            return null
        }
        try {
            const samples = this.decoder.decodeFloatInto(this.decodeScratch, mlowFrame)
            this.decodeSuccess++
            if (samples > 0) {
                this.lastDecodedSamples = samples
            }
            return this.decodeScratch.subarray(0, samples)
        } catch (err) {
            this.decodeErrors++
            if (this.traceEnabled)
                this.logger.trace('mlow decode failed', { message: toError(err).message })
            return null
        }
    }

    private recoverPrevious(nextPacket: Uint8Array, frameSize: number): Float32Array {
        if (!this.decoder) {
            return this.silence(frameSize)
        }
        try {
            const samples = this.decoder.decodeFloatInto(this.decodeScratch, nextPacket, {
                decodeFec: true,
                frameSize
            })
            this.fecFrames++
            return this.decodeScratch.subarray(0, samples)
        } catch (err) {
            if (this.traceEnabled)
                this.logger.trace('mlow fec decode failed, concealing instead', {
                    message: toError(err).message
                })
            return this.conceal(frameSize)
        }
    }

    private conceal(frameSize: number): Float32Array {
        if (!this.decoder) {
            return this.silence(frameSize)
        }
        try {
            const samples = this.decoder.decodeFloatInto(this.decodeScratch, null, { frameSize })
            this.plcFrames++
            return this.decodeScratch.subarray(0, samples)
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
    private concealFrameSize(): number {
        const last = this.lastDecodedSamples
        if (last <= 0) {
            return FRAME_SIZE
        }
        const quantized = Math.round(last / CONCEAL_QUANTUM) * CONCEAL_QUANTUM
        if (quantized < CONCEAL_QUANTUM) {
            return CONCEAL_QUANTUM
        }
        return quantized > MAX_FRAME_SIZE ? MAX_FRAME_SIZE : quantized
    }

    private silence(frameSize: number): Float32Array {
        const size = frameSize > MAX_FRAME_SIZE ? MAX_FRAME_SIZE : frameSize
        return this.silenceScratch.subarray(0, size)
    }

    private writeCtl(request: number, value: number | undefined): void {
        if (value === undefined || !this.encoder) {
            return
        }
        try {
            this.encoder.encoderCtl(request, value)
        } catch (err) {
            this.logger.warn('mlow encoder ctl rejected', {
                request,
                value,
                message: toError(err).message
            })
        }
    }
}

function clampPercent(value: number): number {
    if (!Number.isFinite(value)) {
        return 0
    }
    const rounded = Math.round(value)
    if (rounded < 0) {
        return 0
    }
    return rounded > 100 ? 100 : rounded
}
