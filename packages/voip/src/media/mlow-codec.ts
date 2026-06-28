const MLOW_SAMPLE_RATE = 16_000 as const
const MLOW_CHANNELS = 1 as const
const FRAME_SIZE = 960
const MAX_FRAME_SIZE = 1_920

const APPLICATION_VOIP = 2048
const SIGNAL_VOICE = 3001

interface MlowEncoder {
    encode(pcm: Int16Array, options?: { readonly frameSize?: number }): Uint8Array
    free(): void
}

interface MlowDecoder {
    decodeFloat(packet: Uint8Array, options?: { readonly frameSize?: number }): Float32Array
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
    readonly bitrate?: number
    readonly complexity?: number
    readonly fec?: boolean
}

export class MLowCodec {
    private encoder: MlowEncoder | null = null
    private decoder: MlowDecoder | null = null
    private readonly frameSize = FRAME_SIZE
    private decodeErrors = 0
    private decodeSuccess = 0
    private plcFrames = 0
    private opts: MLowCodecOptions = {}

    private constructor() {}

    static async create(opts: MLowCodecOptions = {}): Promise<MLowCodec> {
        const codec = new MLowCodec()
        await codec.init(opts)
        return codec
    }

    private async init(opts: MLowCodecOptions): Promise<void> {
        this.opts = opts
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
                fec: opts.fec ?? false,
                bitrate: opts.bitrate ?? 25_000,
                complexity: opts.complexity ?? 9,
                signal: SIGNAL_VOICE
            })
        } catch (err) {
            this.decoder?.free()
            this.decoder = null
            throw err
        }
    }

    encode(float32Audio: Float32Array): Uint8Array {
        if (!this.encoder) {
            throw new Error('[MLowCodec] encoder not initialized')
        }
        const pcm = new Int16Array(float32Audio.length)
        for (let i = 0; i < float32Audio.length; i++) {
            const sample = Math.max(-1, Math.min(1, float32Audio[i]))
            pcm[i] = Math.round(sample * 32_767)
        }
        return this.encoder.encode(pcm, { frameSize: this.frameSize })
    }

    decode(mlowFrame: Uint8Array | null): Float32Array {
        if (!this.decoder) {
            throw new Error('[MLowCodec] decoder not initialized')
        }

        if (mlowFrame === null) {
            this.plcFrames++
            return this.decoder.decodePacketLossFloat(this.frameSize)
        }

        try {
            const audio = this.decoder.decodeFloat(mlowFrame, { frameSize: this.frameSize })
            this.decodeSuccess++
            return audio
        } catch {
            this.decodeErrors++
            return this.silence()
        }
    }

    private silence(): Float32Array {
        return new Float32Array(this.frameSize)
    }

    getStats(): { success: number; errors: number; plc: number } {
        return {
            success: this.decodeSuccess,
            errors: this.decodeErrors,
            plc: this.plcFrames
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

    async reset(): Promise<void> {
        this.destroy()
        await this.init(this.opts)
        this.decodeErrors = 0
        this.decodeSuccess = 0
        this.plcFrames = 0
    }

    destroy(): void {
        this.encoder?.free()
        this.decoder?.free()
        this.encoder = null
        this.decoder = null
    }
}
