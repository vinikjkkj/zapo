import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import koffi from 'koffi'

function packageNativeDir(): string | null {
    try {
        const req = createRequire(join(process.cwd(), 'index.js'))
        return join(dirname(req.resolve('@zapo-js/voip/package.json')), 'native')
    } catch {
        return null
    }
}

const MLOW_SAMPLE_RATE = 16000
const MLOW_CHANNELS = 1
const OPUS_APPLICATION_VOIP = 2048

const CTL = {
    SET_BITRATE: 4002,
    SET_COMPLEXITY: 4010,
    SET_SIGNAL: 4024,
    SET_INBAND_FEC: 4012,
    SET_PACKET_LOSS_PERC: 4014,
    SET_DTX: 4016,
    SET_USING_SMPL: 4050,
    GET_USING_SMPL: 4051,
    SIGNAL_VOICE: 3001
} as const

function resolveLibPath(): string {
    if (process.env.MLOW_LIB_PATH && existsSync(process.env.MLOW_LIB_PATH)) {
        return process.env.MLOW_LIB_PATH
    }

    const names =
        process.platform === 'darwin'
            ? ['libopus_mlow.dylib']
            : process.platform === 'win32'
              ? process.arch === 'arm64'
                  ? ['opus_mlow.arm64.dll', 'opus_mlow.dll', 'libopus_mlow.dll']
                  : ['opus_mlow.dll', 'libopus_mlow.dll']
              : process.arch === 'arm64'
                ? ['libopus_mlow.arm64.so', 'libopus_mlow.so']
                : ['libopus_mlow.so', 'libopus_mlow.so.0', 'libopus_mlow.so.0.0.0']

    const pkgNativeDir = packageNativeDir()
    const baseDirs = [
        ...(pkgNativeDir ? [pkgNativeDir] : []),
        join(process.cwd(), 'node_modules', '@zapo-js', 'voip', 'native'),
        join(process.cwd(), 'native')
    ]

    const tried: string[] = []
    for (const dir of baseDirs) {
        for (const name of names) {
            const p = join(dir, name)
            tried.push(p)
            if (existsSync(p)) return p
        }
    }
    throw new Error(
        `[MLowCodec] native lib (${names.join('/')}) not found. Tried:\n  ${tried.join('\n  ')}\n` +
            `Build opus_mlow and place the lib in a native/ dir next to the module, or set MLOW_LIB_PATH.`
    )
}

let lib: any = null
let api: {
    global_create: () => void
    decoder_create: (fs: number, ch: number, err: Uint8Array | null) => unknown
    decoder_ctl: (dec: unknown, req: number, val: number) => number
    decode: (
        dec: unknown,
        data: Uint8Array | null,
        len: number,
        pcm: Int16Array,
        frameSize: number,
        fec: number
    ) => number
    decoder_destroy: (dec: unknown) => void
    encoder_create: (fs: number, ch: number, app: number, err: Uint8Array | null) => unknown
    encoder_ctl: (enc: unknown, req: number, val: number) => number
    encode: (
        enc: unknown,
        pcm: Int16Array,
        frameSize: number,
        data: Uint8Array,
        max: number
    ) => number
    encoder_destroy: (enc: unknown) => void
    strerror: (code: number) => string
} | null = null

let globalInitDone = false

function getApi() {
    if (api) return api
    lib = koffi.load(resolveLibPath())

    const ptr = 'void *'

    const rawDecCtl = lib.func('int opus_decoder_ctl(void *, int, ...)')
    const rawEncCtl = lib.func('int opus_encoder_ctl(void *, int, ...)')
    api = {
        global_create: lib.func('void opus_global_create()'),
        decoder_create: lib.func(`${ptr} opus_decoder_create(int32_t, int, _Out_ uint8_t *)`),
        decoder_ctl: (dec: unknown, req: number, val: number) => rawDecCtl(dec, req, 'int', val),
        decode: lib.func(
            'int opus_decode(void *, uint8_t *, int32_t, _Inout_ int16_t *, int, int)'
        ),
        decoder_destroy: lib.func('void opus_decoder_destroy(void *)'),
        encoder_create: lib.func(`${ptr} opus_encoder_create(int32_t, int, int, _Out_ uint8_t *)`),
        encoder_ctl: (enc: unknown, req: number, val: number) => rawEncCtl(enc, req, 'int', val),
        encode: lib.func('int opus_encode(void *, int16_t *, int, _Inout_ uint8_t *, int32_t)'),
        encoder_destroy: lib.func('void opus_encoder_destroy(void *)'),
        strerror: lib.func('const char *opus_strerror(int)')
    }
    return api
}

function ensureGlobalInit() {
    if (globalInitDone) return
    getApi().global_create()
    globalInitDone = true
}

export class MLowCodec {
    private encoder: unknown = null
    private decoder: unknown = null
    private readonly frameSize = 960
    private readonly maxOut = 5760
    private decodeErrors = 0
    private decodeSuccess = 0
    private plcFrames = 0

    constructor(opts: { bitrate?: number; complexity?: number; fec?: boolean } = {}) {
        ensureGlobalInit()
        this.createDecoder()
        this.createEncoder(opts)
    }

    private createDecoder(): void {
        const a = getApi()
        const err = new Uint8Array(4)
        this.decoder = a.decoder_create(MLOW_SAMPLE_RATE, MLOW_CHANNELS, err)
        if (!this.decoder) throw new Error('[MLowCodec] opus_decoder_create failed')
        a.decoder_ctl(this.decoder, CTL.SET_USING_SMPL, 1)
    }

    private createEncoder(opts: { bitrate?: number; complexity?: number; fec?: boolean }): void {
        const a = getApi()
        const err = new Uint8Array(4)
        this.encoder = a.encoder_create(MLOW_SAMPLE_RATE, MLOW_CHANNELS, OPUS_APPLICATION_VOIP, err)
        if (!this.encoder) throw new Error('[MLowCodec] opus_encoder_create failed')
        a.encoder_ctl(this.encoder, CTL.SET_USING_SMPL, 1)
        a.encoder_ctl(this.encoder, CTL.SET_BITRATE, opts.bitrate ?? 6000)
        a.encoder_ctl(this.encoder, CTL.SET_COMPLEXITY, opts.complexity ?? 5)
        a.encoder_ctl(this.encoder, CTL.SET_SIGNAL, CTL.SIGNAL_VOICE)
        a.encoder_ctl(this.encoder, CTL.SET_INBAND_FEC, opts.fec ? 1 : 0)
        a.encoder_ctl(this.encoder, CTL.SET_DTX, 1)
    }

    encode(float32Audio: Float32Array): Uint8Array {
        const a = getApi()
        const pcm = new Int16Array(float32Audio.length)
        for (let i = 0; i < float32Audio.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Audio[i]))
            pcm[i] = Math.round(s * 32767)
        }
        const out = new Uint8Array(4000)
        const n = a.encode(this.encoder, pcm, float32Audio.length, out, out.length)
        if (n < 0) throw new Error(`[MLowCodec] encode failed: ${a.strerror(n)}`)
        return out.slice(0, n)
    }

    decode(mlowFrame: Uint8Array | null): Float32Array {
        const a = getApi()
        const out = new Int16Array(this.maxOut)
        let samples: number
        if (mlowFrame === null) {
            samples = a.decode(this.decoder, null, 0, out, this.frameSize, 0)
            this.plcFrames++
        } else {
            samples = a.decode(this.decoder, mlowFrame, mlowFrame.length, out, this.maxOut, 0)
            if (samples < 0) {
                this.decodeErrors++
                return this.silence()
            }
            this.decodeSuccess++
        }
        if (samples <= 0) return this.silence()
        const f32 = new Float32Array(samples)
        for (let i = 0; i < samples; i++) f32[i] = out[i] / 32768.0
        return f32
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

    reset(): void {
        const a = getApi()
        if (this.decoder) a.decoder_destroy(this.decoder)
        if (this.encoder) a.encoder_destroy(this.encoder)
        this.createDecoder()
        this.createEncoder({})
        this.decodeErrors = 0
        this.decodeSuccess = 0
        this.plcFrames = 0
    }

    destroy(): void {
        const a = getApi()
        if (this.decoder) a.decoder_destroy(this.decoder)
        if (this.encoder) a.encoder_destroy(this.encoder)
        this.decoder = null
        this.encoder = null
    }
}
