import type { TestContext } from 'node:test'

import type { InboundVideoFrame } from '../../types.js'

export class FakeVideoFrame {
    static readonly all: FakeVideoFrame[] = []
    readonly displayWidth: number
    readonly displayHeight: number
    readonly timestamp: number
    closed = false

    constructor(
        source: FakeVideoFrame | { width: number; height: number },
        init?: { timestamp: number }
    ) {
        if (source instanceof FakeVideoFrame) {
            this.displayWidth = source.displayWidth
            this.displayHeight = source.displayHeight
        } else {
            this.displayWidth = source.width
            this.displayHeight = source.height
        }
        this.timestamp = init?.timestamp ?? 0
        FakeVideoFrame.all.push(this)
    }

    close(): void {
        this.closed = true
    }
}

export interface EncodeCall {
    readonly timestamp: number
    readonly keyFrame: boolean
    readonly width: number
    readonly height: number
}

export class FakeVideoEncoder {
    static readonly all: FakeVideoEncoder[] = []
    readonly configs: VideoEncoderConfig[] = []
    readonly encodes: EncodeCall[] = []
    state: CodecState = 'unconfigured'
    encodeQueueSize = 0
    throwOnEncode: Error | null = null
    private readonly init: VideoEncoderInit

    constructor(init: VideoEncoderInit) {
        this.init = init
        FakeVideoEncoder.all.push(this)
    }

    configure(config: VideoEncoderConfig): void {
        this.configs.push(config)
        this.state = 'configured'
    }

    encode(frame: FakeVideoFrame, options?: VideoEncoderEncodeOptions): void {
        if (this.throwOnEncode) throw this.throwOnEncode
        this.encodes.push({
            timestamp: frame.timestamp,
            keyFrame: options?.keyFrame ?? false,
            width: frame.displayWidth,
            height: frame.displayHeight
        })
    }

    close(): void {
        this.state = 'closed'
    }

    /** The encoder's output callback, as WebCodecs fires it. */
    emit(type: 'key' | 'delta', timestamp: number, bytes: number[]): void {
        const data = Uint8Array.from(bytes)
        this.init.output(
            {
                type,
                timestamp,
                byteLength: data.length,
                copyTo: (target: Uint8Array) => target.set(data)
            } as unknown as EncodedVideoChunk,
            {}
        )
    }

    fail(error: Error): void {
        this.state = 'closed'
        this.init.error(error as DOMException)
    }
}

export class FakeEncodedVideoChunk {
    readonly type: 'key' | 'delta'
    readonly timestamp: number
    readonly data: Uint8Array

    constructor(init: { type: 'key' | 'delta'; timestamp: number; data: Uint8Array }) {
        this.type = init.type
        this.timestamp = init.timestamp
        this.data = init.data
    }
}

export class FakeVideoDecoder {
    static readonly all: FakeVideoDecoder[] = []
    readonly configs: VideoDecoderConfig[] = []
    readonly decodes: FakeEncodedVideoChunk[] = []
    state: CodecState = 'unconfigured'
    decodeQueueSize = 0
    throwOnConfigure: Error | null = null
    private readonly init: VideoDecoderInit

    constructor(init: VideoDecoderInit) {
        this.init = init
        FakeVideoDecoder.all.push(this)
    }

    configure(config: VideoDecoderConfig): void {
        if (this.throwOnConfigure) throw this.throwOnConfigure
        this.configs.push(config)
        this.state = 'configured'
    }

    decode(chunk: FakeEncodedVideoChunk): void {
        this.decodes.push(chunk)
    }

    close(): void {
        this.state = 'closed'
    }

    /** One decoded picture out of the output callback. */
    output(): FakeVideoFrame {
        const picture = new FakeVideoFrame({ width: 640, height: 480 })
        this.init.output(picture as unknown as VideoFrame)
        return picture
    }

    fail(error: Error): void {
        this.state = 'closed'
        this.init.error(error as DOMException)
    }
}

export class FakeTrack {
    readonly kind: string
    stops = 0

    constructor(kind = 'video') {
        this.kind = kind
    }

    stop(): void {
        this.stops++
    }
}

export class FakeProcessor {
    static readonly all: FakeProcessor[] = []
    readonly track: FakeTrack
    readonly readable: ReadableStream<FakeVideoFrame>
    cancelled = false
    private controller!: ReadableStreamDefaultController<FakeVideoFrame>

    constructor(init: { track: FakeTrack }) {
        this.track = init.track
        this.readable = new ReadableStream<FakeVideoFrame>({
            start: (controller) => {
                this.controller = controller
            },
            cancel: () => {
                this.cancelled = true
            }
        })
        FakeProcessor.all.push(this)
    }

    push(width: number, height: number): FakeVideoFrame {
        const frame = new FakeVideoFrame({ width, height })
        this.controller.enqueue(frame)
        return frame
    }
}

export interface FakeClock {
    nowMs: number
}

/** Installs fake WebCodecs and a hand-moved `performance.now` on `globalThis` for one test. */
export function installFakeWebCodecs(t: TestContext): FakeClock {
    const clock: FakeClock = { nowMs: 1_000 }
    const replaced: Record<string, PropertyDescriptor | undefined> = {}
    const install = (name: string, value: unknown): void => {
        replaced[name] = Object.getOwnPropertyDescriptor(globalThis, name)
        Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
    }
    FakeVideoFrame.all.length = 0
    FakeVideoEncoder.all.length = 0
    FakeVideoDecoder.all.length = 0
    FakeProcessor.all.length = 0
    install('VideoFrame', FakeVideoFrame)
    install('VideoEncoder', FakeVideoEncoder)
    install('VideoDecoder', FakeVideoDecoder)
    install('EncodedVideoChunk', FakeEncodedVideoChunk)
    install('MediaStreamTrackProcessor', FakeProcessor)
    install('performance', { now: () => clock.nowMs })
    t.after(() => {
        for (const [name, descriptor] of Object.entries(replaced)) {
            if (descriptor) Object.defineProperty(globalThis, name, descriptor)
            else delete (globalThis as Record<string, unknown>)[name]
        }
    })
    return clock
}

/** Lets the sender's read loop take every frame queued so far. */
export async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}

/** SPS of Constrained Baseline 3.1 (`42 C0 1F`), PPS, then an IDR slice. */
export const KEY_FRAME = [
    0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1f, 0xda, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 1, 0x65, 0x88
]
export const DELTA_FRAME = [0, 0, 0, 1, 0x41, 0x9a]

export function inbound(
    ssrc: number,
    timestamp: number,
    keyFrame: boolean,
    bytes: number[] = keyFrame ? KEY_FRAME : DELTA_FRAME
): InboundVideoFrame {
    return { codec: 'h264', ssrc, timestamp, keyFrame, data: Uint8Array.from(bytes) }
}
