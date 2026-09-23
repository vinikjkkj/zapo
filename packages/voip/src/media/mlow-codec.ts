import { createNoopLogger, type Logger } from 'zapo-js'
import { toError } from 'zapo-js/util'

const MLOW_SAMPLE_RATE = 16_000 as const
const MLOW_CHANNELS = 1 as const
const FRAME_SIZE = 960
const MAX_FRAME_SIZE = 1_920

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

const SEQ_SPACE = 0x1_0000
const SEQ_HALF = 0x8000

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

interface MlowDecodeOptions {
    readonly decodeFec?: boolean
    readonly frameSize?: number
    readonly maxFrameSize?: number
}

interface MlowEncoder {
    encode(pcm: Int16Array, options?: { readonly frameSize?: number }): Uint8Array
    encoderCtl(request: number, value: number): void
    setPacketLossPercent(percentage: number): void
    free(): void
}

interface MlowDecoder {
    decodeFloat(packet: Uint8Array, options?: MlowDecodeOptions): Float32Array
    decodePacketLossFloat(frameSize?: number): Float32Array
    free(): void
}

interface MlowModule {
    loadLibopus(): Promise<{ version: string }>
    createEncoder(options?: Record<string, unknown>): Promise<MlowEncoder>
    createDecoder(options?: Record<string, unknown>): Promise<MlowDecoder>
}

let wasmReady: Promise<MlowModule> | null = null

function loadMlowModule(): Promise<MlowModule> {
    if (!wasmReady) {
        wasmReady = import('libmlow-wasm')
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
}

export class MLowCodec {
    private encoder: MlowEncoder | null = null
    private decoder: MlowDecoder | null = null
    private readonly frameSize = FRAME_SIZE
    private logger: Logger = createNoopLogger()

    private decodeErrors = 0
    private decodeSuccess = 0
    private plcFrames = 0
    private fecFrames = 0
    private lateFrames = 0
    private concealCapped = 0

    private opts: MLowCodecOptions = {}
    private packetLossPercent = 0
    private maxConcealFrames = DEFAULT_MAX_CONCEAL_FRAMES

    private lastSeq = -1
    private lastDecodedSamples = 0

    /** Reused PCM staging buffer for the encoder, one full frame wide. */
    private readonly pcmScratch = new Int16Array(FRAME_SIZE)
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

        const lib = await loadMlowModule()

        this.decoder = await lib.createDecoder({
            channels: MLOW_CHANNELS,
            sampleRate: MLOW_SAMPLE_RATE,
            useSmpl: true,
            maxFrameSize: MAX_FRAME_SIZE
        })

        try {
            this.encoder = await lib.createEncoder({
                channels: MLOW_CHANNELS,
                sampleRate: MLOW_SAMPLE_RATE,
                application: APPLICATION_VOIP,
                frameSize: FRAME_SIZE,
                useSmpl: true,
                dtx: true,
                fec: opts.fec ?? true,
                packetLossPercent: this.packetLossPercent,
                bitrate: opts.bitrate ?? DEFAULT_BITRATE,
                complexity: opts.complexity ?? DEFAULT_COMPLEXITY,
                signal: SIGNAL_VOICE
            })
        } catch (err) {
            this.decoder?.free()
            this.decoder = null
            throw err
        }

        if (opts.tunables) {
            this.applyEncoderTunables(opts.tunables)
        }
    }

    encode(float32Audio: Float32Array): Uint8Array {
        if (!this.encoder) {
            throw new Error('[MLowCodec] encoder not initialized')
        }
        if (float32Audio.length !== this.frameSize) {
            throw new Error(
                `[MLowCodec] encode expects ${this.frameSize} samples, got ${float32Audio.length}`
            )
        }
        const pcm = this.pcmScratch
        for (let i = 0; i < pcm.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Audio[i]))
            pcm[i] = Math.round(sample * 32_767)
        }
        return this.encoder.encode(pcm, { frameSize: this.frameSize })
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
            return this.conceal(this.concealFrameSize())
        }

        const decoded = this.tryDecode(mlowFrame)
        return decoded ?? this.silence(this.concealFrameSize())
    }

    /**
     * Decode one inbound packet identified by its RTP sequence number and hand
     * every resulting PCM frame to `onFrame`, oldest first.
     *
     * Gaps since the previous sequence number are filled first: the frame right
     * before the arriving packet from the in-band FEC copy that packet carries,
     * anything older by concealment, and nothing past `maxConcealFrames`. A
     * duplicate or late packet is dropped rather than emitted out of order.
     *
     * A packet the decoder rejects is treated the same as one that never
     * arrived, but only for its own slot: `lastSeq` still advances to just
     * behind it, so only the rejected packet itself - not the packets
     * already covered by this call's own gap concealment - is left for the
     * next packet's FEC copy to recover. Leaving `lastSeq` further back would
     * hand that already-covered ground to the next gap too, emitting the same
     * frames twice.
     */
    decodeSequenced(seq: number, packet: Uint8Array, onFrame: (pcm: Float32Array) => void): void {
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
            if (delta > 1) {
                this.concealGap(delta - 1, packet, onFrame)
            }
        }

        const decoded = this.tryDecode(packet)
        if (decoded === null) {
            this.lastSeq = (current - 1 + SEQ_SPACE) % SEQ_SPACE
            return
        }
        this.lastSeq = current
        onFrame(decoded)
    }

    /** Forget the inbound sequence position, for example after an SSRC change. */
    resetSequence(): void {
        this.lastSeq = -1
        this.lastDecodedSamples = 0
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
            concealCapped: this.concealCapped
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
        this.resetSequence()
    }

    destroy(): void {
        this.encoder?.free()
        this.decoder?.free()
        this.encoder = null
        this.decoder = null
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
        onFrame(this.recoverPrevious(nextPacket, frameSize))
    }

    /** Decode one packet against the live decoder, or `null` if it was rejected. */
    private tryDecode(mlowFrame: Uint8Array): Float32Array | null {
        if (!this.decoder) {
            return null
        }
        try {
            const audio = this.decoder.decodeFloat(mlowFrame)
            this.decodeSuccess++
            if (audio.length > 0) {
                this.lastDecodedSamples = audio.length
            }
            return audio
        } catch (err) {
            this.decodeErrors++
            this.logger.trace('mlow decode failed', { message: toError(err).message })
            return null
        }
    }

    private recoverPrevious(nextPacket: Uint8Array, frameSize: number): Float32Array {
        if (!this.decoder) {
            return this.silence(frameSize)
        }
        try {
            const recovered = this.decoder.decodeFloat(nextPacket, {
                decodeFec: true,
                frameSize
            })
            this.fecFrames++
            return recovered
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
            const concealed = this.decoder.decodePacketLossFloat(frameSize)
            this.plcFrames++
            return concealed
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
