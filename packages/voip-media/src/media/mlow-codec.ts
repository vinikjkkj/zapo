import { toError } from '../errors.js'
import { createNoopLogger, type Logger } from '../logger.js'

const MLOW_SAMPLE_RATE = 16_000 as const
const MLOW_CHANNELS = 1 as const
const FRAME_SIZE = 960
const MAX_FRAME_SIZE = 1_920

/** The library's ceiling on one encoded packet, and the size an encode target needs. */
export const MLOW_MAX_PACKET_BYTES = 4_000

const APPLICATION_VOIP = 2048
const SIGNAL_VOICE = 3001

/**
 * Encodes through the library's float path instead of staging the frame as int16. It changes the
 * bytes on the wire, so it stays off until a live A/B settles it.
 */
const ENCODE_FLOAT_INPUT = false

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

/** RTP timestamp steps past this are taken as a broken timeline, not as a packet's span. */
const MAX_TIMESTAMP_STEP = 0x8000_0000

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
    encode(pcm: Int16Array, options?: { readonly frameSize?: number }): Uint8Array
    encodeInto(pcm: Int16Array, target: Uint8Array): number
    encodeFloatInto(pcm: Float32Array, target: Uint8Array): number
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
export function readMlowSubframes(packet: Uint8Array, bounds: Int32Array): number {
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

export interface MLowCodecOptions {
    /**
     * Target encoder bitrate in bits per second (default 15000, what WhatsApp
     * uses). The server can hand down a different rung in `<voip_settings>`.
     */
    readonly bitrate?: number
    /** Encoder complexity (0 to 10). Defaults to 5, which is what WhatsApp uses. */
    readonly complexity?: number
    /**
     * Enable in-band FEC on the encoder (default `true`). A redundant copy of
     * the previous frame only goes on the wire while
     * {@link MLowCodecOptions.packetLossPercent} is above zero.
     */
    readonly fec?: boolean
    /**
     * Loss the encoder should protect against, 0 to 100 (default `0`). Drive it
     * from measured inbound loss with
     * {@link MLowCodec.setExpectedPacketLossPercent}.
     */
    readonly packetLossPercent?: number
    /**
     * Hard cap on the concealment frames generated for a single gap (default 5).
     * A longer outage goes silent instead of synthesising audio indefinitely.
     */
    readonly maxConcealFrames?: number
    /** MLow-specific encoder control requests. Unset requests are not written. */
    readonly tunables?: MLowEncoderTunables
    /**
     * Attaches the MLow Companion, WhatsApp's neural post-filter, to the decoder. Weights that
     * fail to load leave the decoder as it was, with a warning. See {@link MLowCompanionModelSource}.
     */
    readonly companionModel?: MLowCompanionModelSource
    /**
     * Runs the RED secondary encoder next to the primary, exposing each frame's redundant copy as
     * {@link MLowCodec.lastSecondary}. Turns DTX off on this encoder, as RED requires.
     */
    readonly red?: boolean | MLowRedOptions
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
    /** Sub-frames past their packet's timestamp span, dropped as RED copies instead of played. */
    readonly redundant: number
    /** Lost packets rebuilt from the RED copy the next packet carried. */
    readonly redRecovered: number
}

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
    private readonly frameSize = FRAME_SIZE
    private logger: Logger = createNoopLogger()

    private decodeErrors = 0
    private decodeSuccess = 0
    private plcFrames = 0
    private fecFrames = 0
    private lateFrames = 0
    private concealCapped = 0
    private redundantSubframes = 0
    private redRecoveredFrames = 0

    private opts: MLowCodecOptions = {}
    private packetLossPercent = 0
    private maxConcealFrames = DEFAULT_MAX_CONCEAL_FRAMES
    private red = false
    private secondary: Uint8Array | null = null

    private lastSeq = -1
    private lastDecodedSamples = 0
    /** RTP timestamp of the last packet played, or -1 when the caller gave none. */
    private lastTimestamp = -1
    /** Timestamp step between the last two consecutive packets, the span a packet covers; 0 unknown. */
    private packetSpan = 0
    /** Samples one sub-frame decoded to, the last time one was decoded alone. */
    private subframeSamples = 0
    /** Sub-frames of the last packet past its span, held until the next packet tells primary from copy. */
    private readonly deferredBytes = new Uint8Array(MLOW_MAX_PACKET_BYTES)
    private readonly deferredBounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    private deferredCount = 0

    /** Reused PCM staging buffer for the encoder, one full frame wide. */
    private readonly pcmScratch = new Int16Array(FRAME_SIZE)
    /** Encode target behind {@link encode}, which hands back a copy. */
    private readonly packetScratch = new Uint8Array(MLOW_MAX_PACKET_BYTES)
    /** Every decoded frame lands here; see {@link decodeSequenced}. */
    private readonly decodeScratch = new Float32Array(MAX_FRAME_SIZE)
    /** `[offset, length]` of each sub-frame of the packet being decoded. */
    private readonly subframeBounds = new Int32Array(MLOW_MAX_SUBFRAMES * 2)
    /** Shared read-only zero frame handed out when a decode cannot be salvaged. */
    private readonly silenceScratch = new Float32Array(MAX_FRAME_SIZE)

    private constructor() {}

    static async create(opts: MLowCodecOptions = {}): Promise<MLowCodec> {
        const codec = new MLowCodec()
        await codec.init(opts)
        return codec
    }

    private async init(opts: MLowCodecOptions): Promise<void> {
        this.opts = opts
        this.logger = opts.logger ?? createNoopLogger()
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
        if (float32Audio.length !== this.frameSize) {
            throw new Error(
                `[MLowCodec] encode expects ${this.frameSize} samples, got ${float32Audio.length}`
            )
        }
        this.secondary = null
        let length: number
        if (ENCODE_FLOAT_INPUT) {
            length = encoder.encodeFloatInto(float32Audio, target)
        } else {
            const pcm = this.pcmScratch
            for (let i = 0; i < pcm.length; i++) {
                const sample = Math.max(-1, Math.min(1, float32Audio[i]))
                pcm[i] = Math.round(sample * 32_767)
            }
            length = encoder.encodeInto(pcm, target)
        }
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

    /** Whether the Companion is attached to the decoder. */
    get companionActive(): boolean {
        return this.decoder?.hasCompanion ?? false
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

        const decoded = this.tryDecode(mlowFrame)
        return decoded ? decoded.slice() : this.silence(this.concealFrameSize())
    }

    /**
     * Decode one inbound packet identified by its RTP sequence number and hand
     * every resulting PCM frame to `onFrame`, oldest first. Every frame is a view
     * of one buffer the next decode overwrites: it is valid only during the
     * callback, so a consumer that keeps it copies it.
     *
     * Gaps since the previous sequence number are filled first: the frame right
     * before the arriving packet from the RED copy that packet carries, or else
     * from its in-band FEC, anything older by concealment, and nothing past
     * `maxConcealFrames`. A duplicate or late packet is dropped rather than
     * emitted out of order.
     *
     * With `timestamp`, a multiframe packet plays only the sub-frames that fit the
     * span the RTP timeline gives a packet; the rest wait for the next packet, which
     * plays them if the timeline leaves room and otherwise drops them as RED copies.
     * Without it every packet decodes whole.
     *
     * A packet the decoder rejects is treated the same as one that never
     * arrived, but only for its own slot: `lastSeq` still advances to just
     * behind it, so only the rejected packet itself - not the packets
     * already covered by this call's own gap concealment - is left for the
     * next packet's FEC copy to recover. Leaving `lastSeq` further back would
     * hand that already-covered ground to the next gap too, emitting the same
     * frames twice.
     */
    decodeSequenced(
        seq: number,
        packet: Uint8Array,
        onFrame: (pcm: Float32Array) => void,
        timestamp?: number
    ): void {
        if (!this.decoder) {
            throw new Error('[MLowCodec] decoder not initialized')
        }
        if (packet.length === 0) {
            return
        }

        const current = seq & 0xffff
        if (this.lastSeq >= 0) {
            const delta = (current - this.lastSeq + SEQ_SPACE) % SEQ_SPACE
            if (delta === 0 || delta >= SEQ_HALF) {
                this.lateFrames++
                this.logger.trace('mlow packet arrived out of order', {
                    seq: current,
                    lastSeq: this.lastSeq
                })
                return
            }
            if (delta === 1) {
                this.observeStep(timestamp, onFrame)
            } else {
                // A lost packet in between leaves the held sub-frames with no step to judge them by.
                this.deferredCount = 0
                this.concealGap(delta - 1, packet, onFrame)
            }
        }

        const decoded = this.decodeWithinSpan(packet)
        if (decoded === null) {
            this.lastSeq = (current - 1 + SEQ_SPACE) % SEQ_SPACE
            return
        }
        this.lastSeq = current
        this.lastTimestamp = timestamp === undefined ? -1 : timestamp >>> 0
        onFrame(decoded)
    }

    /**
     * Forget the inbound sequence position, for example after an SSRC change. The
     * Companion's recurrent state restarts with it.
     */
    resetSequence(): void {
        this.lastSeq = -1
        this.lastDecodedSamples = 0
        this.lastTimestamp = -1
        this.packetSpan = 0
        this.subframeSamples = 0
        this.deferredCount = 0
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

    getExpectedPacketLossPercent(): number {
        return this.packetLossPercent
    }

    /**
     * Write the requests in {@link MLOW_ENCODER_CTL}; absent fields are left
     * untouched. The values survive {@link MLowCodec.reset}.
     */
    applyEncoderTunables(tunables: MLowEncoderTunables): void {
        if (!this.encoder) {
            throw new Error('[MLowCodec] encoder not initialized')
        }
        this.opts = { ...this.opts, tunables }
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
        return this.frameSize
    }

    getFrameDurationMs(): number {
        return (this.frameSize / MLOW_SAMPLE_RATE) * 1000
    }

    getSampleRate(): number {
        return MLOW_SAMPLE_RATE
    }

    getMaxConcealFrames(): number {
        return this.maxConcealFrames
    }

    async reset(): Promise<void> {
        this.destroy()
        await this.init(this.opts)
        this.decodeErrors = 0
        this.decodeSuccess = 0
        this.plcFrames = 0
        this.fecFrames = 0
        this.lateFrames = 0
        this.concealCapped = 0
        this.redundantSubframes = 0
        this.redRecoveredFrames = 0
        this.resetSequence()
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

    private subframe(packet: Uint8Array, index: number): Uint8Array {
        const offset = this.subframeBounds[index * 2]
        return packet.subarray(offset, offset + this.subframeBounds[index * 2 + 1])
    }

    /**
     * Learns the span the previous packet covered from the timestamp step, and settles the
     * sub-frames it held back: played when the step leaves room for them, dropped when the
     * step was already filled, which a plain stream never does and a RED one always does.
     */
    private observeStep(timestamp: number | undefined, onFrame: (pcm: Float32Array) => void): void {
        const held = this.deferredCount
        this.deferredCount = 0
        if (timestamp === undefined || this.lastTimestamp < 0) {
            return
        }
        const step = ((timestamp >>> 0) - this.lastTimestamp) >>> 0
        if (step === 0 || step >= MAX_TIMESTAMP_STEP) {
            return
        }
        if (held > 0) {
            const room = step - this.lastDecodedSamples
            if (room > 0) {
                this.playDeferred(held, room, onFrame)
            } else {
                this.redundantSubframes += held
            }
        }
        this.packetSpan = step
    }

    private playDeferred(held: number, room: number, onFrame: (pcm: Float32Array) => void): void {
        const decoder = this.decoder
        if (!decoder) {
            return
        }
        let samples = 0
        try {
            for (let index = 0; index < held && samples < room; index++) {
                const offset = this.deferredBounds[index * 2]
                const frame = this.deferredBytes.subarray(
                    offset,
                    offset + this.deferredBounds[index * 2 + 1]
                )
                samples += decoder.decodeFloatInto(this.decodeScratch.subarray(samples), frame)
            }
        } catch (err) {
            this.decodeErrors++
            this.logger.trace('mlow held sub-frame decode failed', {
                message: toError(err).message
            })
            return
        }
        if (samples > 0) {
            onFrame(this.decodeScratch.subarray(0, samples))
        }
    }

    /** Copies sub-frames `from` to `count` of `packet` aside for {@link observeStep} to settle. */
    private holdTail(packet: Uint8Array, from: number, count: number): void {
        const start = this.subframeBounds[from * 2]
        if (packet.length - start > this.deferredBytes.length) return
        this.deferredBytes.set(packet.subarray(start))
        for (let index = from; index < count; index++) {
            const held = (index - from) * 2
            this.deferredBounds[held] = this.subframeBounds[index * 2] - start
            this.deferredBounds[held + 1] = this.subframeBounds[index * 2 + 1]
        }
        this.deferredCount = count - from
    }

    private concealGap(
        missing: number,
        nextPacket: Uint8Array,
        onFrame: (pcm: Float32Array) => void
    ): void {
        const limit = this.maxConcealFrames
        const frames = missing > limit ? limit : missing
        if (frames < missing) {
            this.concealCapped++
            this.logger.trace('mlow concealment capped', { missing, frames })
        }
        if (frames <= 0) {
            return
        }

        const frameSize = this.concealFrameSize()
        for (let i = 0; i < frames - 1; i++) {
            onFrame(this.conceal(frameSize))
        }
        onFrame(this.recoverFromCopy(nextPacket) ?? this.recoverPrevious(nextPacket, frameSize))
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
            this.logger.trace('mlow decode failed', { message: toError(err).message })
            return null
        }
    }

    /**
     * Decodes a multiframe packet one sub-frame at a time until the known span is covered and
     * holds the rest back; a single frame, or a stream with no span yet, decodes whole.
     */
    private decodeWithinSpan(packet: Uint8Array): Float32Array | null {
        const decoder = this.decoder
        const count = this.packetSpan > 0 ? readMlowSubframes(packet, this.subframeBounds) : 0
        if (!decoder || count === 0) {
            return this.tryDecode(packet)
        }
        let samples = 0
        let index = 0
        try {
            while (index < count && samples < this.packetSpan) {
                const decoded = decoder.decodeFloatInto(
                    this.decodeScratch.subarray(samples),
                    this.subframe(packet, index)
                )
                this.subframeSamples = decoded
                samples += decoded
                index++
            }
        } catch (err) {
            this.decodeErrors++
            this.logger.trace('mlow decode failed', { message: toError(err).message })
            return null
        }
        if (index < count) {
            this.holdTail(packet, index, count)
        }
        this.decodeSuccess++
        if (samples > 0) {
            this.lastDecodedSamples = samples
        }
        return this.decodeScratch.subarray(0, samples)
    }

    /**
     * The sub-frame the arriving packet carries past its span, taken as the RED copy of the
     * frame right before it, or `null` to fall back on in-band FEC.
     */
    private recoverFromCopy(nextPacket: Uint8Array): Float32Array | null {
        if (!this.decoder || this.packetSpan <= 0 || this.subframeSamples <= 0) {
            return null
        }
        const count = readMlowSubframes(nextPacket, this.subframeBounds)
        const primaries = Math.ceil(this.packetSpan / this.subframeSamples)
        if (count <= primaries) {
            return null
        }
        try {
            const samples = this.decoder.decodeFloatInto(
                this.decodeScratch,
                this.subframe(nextPacket, primaries)
            )
            this.redRecoveredFrames++
            return this.decodeScratch.subarray(0, samples)
        } catch (err) {
            this.logger.trace('mlow red copy decode failed, trying fec', {
                message: toError(err).message
            })
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
            return this.frameSize
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
