import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import type { WaCallMediaPlane } from '../../call/WaCallMediaPlane.js'
import type { InboundVideoFrame } from '../../types.js'
import {
    readH264Codec,
    type WaCallVideoSink,
    WaWebCallVideoReceiver,
    WaWebCallVideoSender,
    type WaWebCallVideoSenderOptions
} from '../WaWebCallVideo.js'

/** The plane is the sink the sender is written for; this stops compiling if they part. */
const planeIsASink: WaCallMediaPlane extends WaCallVideoSink ? true : never = true
void planeIsASink

class FakeVideoFrame {
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

interface EncodeCall {
    readonly timestamp: number
    readonly keyFrame: boolean
    readonly width: number
    readonly height: number
}

class FakeVideoEncoder {
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

class FakeEncodedVideoChunk {
    readonly type: 'key' | 'delta'
    readonly timestamp: number
    readonly data: Uint8Array

    constructor(init: { type: 'key' | 'delta'; timestamp: number; data: Uint8Array }) {
        this.type = init.type
        this.timestamp = init.timestamp
        this.data = init.data
    }
}

class FakeVideoDecoder {
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

class FakeTrack {
    readonly kind: string
    stops = 0

    constructor(kind = 'video') {
        this.kind = kind
    }

    stop(): void {
        this.stops++
    }
}

class FakeProcessor {
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

interface FakeClock {
    nowMs: number
}

/** Installs fake WebCodecs and a hand-moved `performance.now` on `globalThis` for one test. */
function installFakeWebCodecs(t: TestContext): FakeClock {
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
async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) await new Promise((resolve) => setImmediate(resolve))
}

class RecordingSink implements WaCallVideoSink {
    readonly sent: { data: number[]; timestampUs: number }[] = []
    packetsPerFrame = 3

    sendVideoFrame(data: Uint8Array, timestampUs: number): number {
        this.sent.push({ data: [...data], timestampUs })
        return this.packetsPerFrame
    }
}

async function startSender(
    t: TestContext,
    options: WaWebCallVideoSenderOptions = {}
): Promise<{
    clock: FakeClock
    sink: RecordingSink
    track: FakeTrack
    sender: WaWebCallVideoSender
    processor: FakeProcessor
    encoder: () => FakeVideoEncoder
}> {
    const clock = installFakeWebCodecs(t)
    const sink = new RecordingSink()
    const track = new FakeTrack()
    const sender = await WaWebCallVideoSender.start(
        sink,
        track as unknown as MediaStreamTrack,
        options
    )
    t.after(() => sender.stop())
    return {
        clock,
        sink,
        track,
        sender,
        processor: FakeProcessor.all[0],
        encoder: () => FakeVideoEncoder.all[FakeVideoEncoder.all.length - 1]
    }
}

test('the first frame is encoded as a key frame at its own size and its access unit sent', async (t) => {
    const { clock, sink, sender, processor, encoder } = await startSender(t)
    clock.nowMs = 1_100
    const source = processor.push(640, 480)
    await settle()

    assert.deepEqual(encoder().configs, [
        {
            codec: 'avc1.42E01F',
            width: 640,
            height: 480,
            bitrate: 600_000,
            framerate: 15,
            latencyMode: 'realtime',
            avc: { format: 'annexb' }
        }
    ])
    assert.deepEqual(encoder().encodes, [
        { timestamp: 100_000, keyFrame: true, width: 640, height: 480 }
    ])
    assert.ok(
        FakeVideoFrame.all.every((frame) => frame.closed),
        'the captured frame and its restamped view are both closed'
    )
    assert.equal(source.closed, true)

    encoder().emit('key', 100_000, [0, 0, 0, 1, 0x65, 0xaa])
    assert.deepEqual(sink.sent, [{ data: [0, 0, 0, 1, 0x65, 0xaa], timestampUs: 100_000 }])
    assert.deepEqual(sender.stats, {
        framesCaptured: 1,
        framesEncoded: 1,
        framesSent: 1,
        framesDropped: 0,
        packetsSent: 3,
        keyFrames: 1,
        width: 640,
        height: 480
    })
})

test('a source faster than the frame rate is thinned to it', async (t) => {
    const { clock, sender, processor, encoder } = await startSender(t)
    for (const atMs of [0, 33, 66, 100, 133]) {
        clock.nowMs = 1_000 + atMs
        processor.push(640, 480)
        await settle()
    }

    assert.deepEqual(
        encoder().encodes.map((call) => call.timestamp),
        [0, 66_000, 133_000],
        'a 30 fps source becomes 15 fps'
    )
    assert.equal(sender.stats.framesDropped, 2)
    assert.ok(
        FakeVideoFrame.all.every((frame) => frame.closed),
        'a thinned frame is closed too'
    )
})

test('key frames come at the interval and whenever one is asked for', async (t) => {
    const { clock, sender, processor, encoder } = await startSender(t, {
        keyFrameIntervalMs: 1_000
    })
    const push = async (atMs: number): Promise<void> => {
        clock.nowMs = 1_000 + atMs
        processor.push(640, 480)
        await settle()
    }
    await push(0)
    await push(100)
    await push(1_000)
    await push(1_100)
    sender.requestKeyFrame()
    await push(1_200)
    await push(1_300)

    assert.deepEqual(
        encoder().encodes.map((call) => call.keyFrame),
        [true, false, true, false, true, false]
    )
})

test('frames are shed while the encoder is backed up', async (t) => {
    const { clock, sender, processor, encoder } = await startSender(t)
    clock.nowMs = 1_000
    processor.push(640, 480)
    await settle()
    encoder().encodeQueueSize = 3
    clock.nowMs = 1_100
    processor.push(640, 480)
    await settle()
    encoder().encodeQueueSize = 0
    clock.nowMs = 1_200
    processor.push(640, 480)
    await settle()

    assert.deepEqual(
        encoder().encodes.map((call) => call.timestamp),
        [0, 200_000]
    )
    assert.equal(sender.stats.framesDropped, 1)
})

test('a large source is fitted into 1280x720 in even dimensions, and a new size starts on a key frame', async (t) => {
    const { clock, sender, processor, encoder } = await startSender(t)
    clock.nowMs = 1_000
    processor.push(1920, 1080)
    await settle()
    clock.nowMs = 1_100
    processor.push(1920, 1080)
    await settle()
    clock.nowMs = 1_200
    processor.push(1366, 768)
    await settle()

    assert.deepEqual(
        encoder().configs.map((config) => [config.width, config.height]),
        [
            [1280, 720],
            [1280, 718]
        ]
    )
    assert.deepEqual(
        encoder().encodes.map((call) => call.keyFrame),
        [true, false, true]
    )
    assert.equal(FakeVideoEncoder.all.length, 1, 'the encoder is reconfigured, not rebuilt')
    assert.deepEqual([sender.stats.width, sender.stats.height], [1280, 718])
})

test('an access unit the plane does not put on the wire counts as encoded, not sent', async (t) => {
    const { clock, sink, sender, processor, encoder } = await startSender(t)
    sink.packetsPerFrame = 0
    clock.nowMs = 1_000
    processor.push(640, 480)
    await settle()
    encoder().emit('key', 0, [0, 0, 1, 0x65])

    assert.equal(sender.stats.framesEncoded, 1)
    assert.equal(sender.stats.framesSent, 0)
    assert.equal(sender.stats.packetsSent, 0)
})

test('while the sink refuses, a key frame is offered every half second for it to open on', async (t) => {
    const { clock, sink, sender, processor, encoder } = await startSender(t)
    sink.packetsPerFrame = 0
    for (const atMs of [0, 100, 200, 300, 400, 500, 600, 700]) {
        clock.nowMs = 1_000 + atMs
        processor.push(640, 480)
        await settle()
        const last = encoder().encodes[encoder().encodes.length - 1]
        encoder().emit(last.keyFrame ? 'key' : 'delta', last.timestamp, [0, 0, 1, 0x41])
    }

    assert.deepEqual(
        encoder().encodes.map((call) => call.keyFrame),
        [true, false, false, false, false, false, true, false],
        'refused for 500 ms since the last key frame, the next frame is one'
    )
    assert.equal(sender.stats.framesSent, 0)

    // Taken from here on: no more key frames than the interval asks for.
    sink.packetsPerFrame = 3
    for (const atMs of [800, 900, 1000, 1100, 1200]) {
        clock.nowMs = 1_000 + atMs
        processor.push(640, 480)
        await settle()
        const last = encoder().encodes[encoder().encodes.length - 1]
        encoder().emit(last.keyFrame ? 'key' : 'delta', last.timestamp, [0, 0, 1, 0x41])
    }
    assert.deepEqual(
        encoder()
            .encodes.slice(8)
            .map((call) => call.keyFrame),
        [false, false, false, false, false]
    )
})

test('replacing the track reads the new one from a key frame, on the same clock, and leaves the old one running', async (t) => {
    const { clock, track, sender, processor, encoder } = await startSender(t)
    clock.nowMs = 1_000
    processor.push(640, 480)
    await settle()
    clock.nowMs = 1_100
    processor.push(640, 480)
    await settle()

    const screen = new FakeTrack()
    await sender.replaceTrack(screen as unknown as MediaStreamTrack)
    const screenProcessor = FakeProcessor.all[1]
    assert.equal(screenProcessor.track, screen)
    assert.equal(processor.cancelled, true, 'the old track is no longer read')
    assert.equal(track.stops, 0, 'the old track is the caller’s to stop')

    clock.nowMs = 1_200
    screenProcessor.push(640, 480)
    await settle()
    assert.deepEqual(
        encoder().encodes.map((call) => [call.timestamp, call.keyFrame]),
        [
            [0, true],
            [100_000, false],
            [200_000, true]
        ]
    )
})

test('an encoder failure is reported, and the next frame builds a new encoder on a key frame', async (t) => {
    const errors: unknown[] = []
    const { clock, processor } = await startSender(t, {
        onError: (error: unknown) => errors.push(error)
    })
    clock.nowMs = 1_000
    processor.push(640, 480)
    await settle()
    clock.nowMs = 1_100
    processor.push(640, 480)
    await settle()

    const failure = new Error('encoder crashed')
    FakeVideoEncoder.all[0].fail(failure)
    assert.deepEqual(errors, [failure])

    clock.nowMs = 1_200
    processor.push(640, 480)
    await settle()
    assert.equal(FakeVideoEncoder.all.length, 2)
    assert.deepEqual(FakeVideoEncoder.all[1].encodes, [
        { timestamp: 200_000, keyFrame: true, width: 640, height: 480 }
    ])
})

test('an encode that throws drops the encoder the same way', async (t) => {
    const errors: unknown[] = []
    const { clock, processor, encoder } = await startSender(t, {
        onError: (error: unknown) => errors.push(error)
    })
    clock.nowMs = 1_000
    processor.push(640, 480)
    await settle()
    encoder().throwOnEncode = new Error('bad frame')
    clock.nowMs = 1_100
    processor.push(640, 480)
    await settle()

    assert.equal(errors.length, 1)
    assert.equal(FakeVideoEncoder.all[0].state, 'closed')
    assert.ok(
        FakeVideoFrame.all.every((frame) => frame.closed),
        'the failed frame is closed'
    )
})

test('stop closes the encoder and the reader, leaves the track, and ignores output after', async (t) => {
    const { clock, sink, track, sender, processor, encoder } = await startSender(t)
    clock.nowMs = 1_000
    processor.push(640, 480)
    await settle()
    const running = encoder()

    await sender.stop()
    await sender.stop()
    assert.equal(running.state, 'closed')
    assert.equal(processor.cancelled, true)
    assert.equal(track.stops, 0)

    running.emit('key', 0, [0, 0, 1, 0x65])
    assert.deepEqual(sink.sent, [], 'a chunk the closed encoder still flushes is not sent')
})

test('start refuses a track that is not video, and a browser with no encoder', async (t) => {
    installFakeWebCodecs(t)
    await assert.rejects(
        WaWebCallVideoSender.start(
            new RecordingSink(),
            new FakeTrack('audio') as unknown as MediaStreamTrack
        ),
        /audio track cannot be sent as video/
    )
    delete (globalThis as Record<string, unknown>).VideoEncoder
    await assert.rejects(
        WaWebCallVideoSender.start(
            new RecordingSink(),
            new FakeTrack() as unknown as MediaStreamTrack
        ),
        /no WebCodecs VideoEncoder/
    )
})

/** SPS of Constrained Baseline 3.1 (`42 C0 1F`), PPS, then an IDR slice. */
const KEY_FRAME = [
    0, 0, 0, 1, 0x67, 0x42, 0xc0, 0x1f, 0xda, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 1, 0x65, 0x88
]
const DELTA_FRAME = [0, 0, 0, 1, 0x41, 0x9a]

function inbound(
    ssrc: number,
    timestamp: number,
    keyFrame: boolean,
    bytes: number[] = keyFrame ? KEY_FRAME : DELTA_FRAME
): InboundVideoFrame {
    return { codec: 'h264', ssrc, timestamp, keyFrame, data: Uint8Array.from(bytes) }
}

function startReceiver(t: TestContext): {
    receiver: WaWebCallVideoReceiver
    pictures: { picture: FakeVideoFrame; ssrc: number }[]
    errors: { error: unknown; ssrc: number }[]
} {
    installFakeWebCodecs(t)
    const pictures: { picture: FakeVideoFrame; ssrc: number }[] = []
    const errors: { error: unknown; ssrc: number }[] = []
    const receiver = new WaWebCallVideoReceiver({
        onFrame: (picture, ssrc) => {
            pictures.push({ picture: picture as unknown as FakeVideoFrame, ssrc })
        },
        onError: (error, ssrc) => errors.push({ error, ssrc })
    })
    t.after(() => receiver.close())
    return { receiver, pictures, errors }
}

test('deltas before the first key frame are dropped; the key frame configures the decoder from its SPS', (t) => {
    const { receiver } = startReceiver(t)
    receiver.push(inbound(7, 90_000, false))
    assert.equal(FakeVideoDecoder.all.length, 0, 'nothing to decode a delta against')

    receiver.push(inbound(7, 96_000, true))
    receiver.push(inbound(7, 102_000, false))

    const [decoder] = FakeVideoDecoder.all
    assert.deepEqual(decoder.configs, [{ codec: 'avc1.42C01F', optimizeForLatency: true }])
    assert.deepEqual(
        decoder.decodes.map((chunk) => [chunk.type, chunk.timestamp]),
        [
            ['key', 66_667],
            ['delta', 133_333]
        ],
        'timestamps run on the RTP clock from the stream’s first frame'
    )
    assert.deepEqual([...decoder.decodes[0].data], KEY_FRAME)
    assert.deepEqual(receiver.stats, {
        framesReceived: 3,
        framesDecoded: 0,
        framesDropped: 1,
        decodeErrors: 0,
        codec: 'avc1.42C01F'
    })
})

test('timestamps step across the 32-bit RTP wrap', (t) => {
    const { receiver } = startReceiver(t)
    receiver.push(inbound(7, 0xfffff000, true))
    receiver.push(inbound(7, 0x00000fa0, false))

    assert.deepEqual(
        FakeVideoDecoder.all[0].decodes.map((chunk) => chunk.timestamp),
        [0, 89_956]
    )
})

test('a timestamp jump past 10 s, either way, goes on from where the stream stood', (t) => {
    const { receiver } = startReceiver(t)
    receiver.push(inbound(7, 1_000_000, true))
    receiver.push(inbound(7, 1_006_000, false))
    // The peer's encoder restarts on a base 11 s back, then again 22 s ahead.
    receiver.push(inbound(7, 10_000, true))
    receiver.push(inbound(7, 16_000, false))
    receiver.push(inbound(7, 2_000_000, true))
    receiver.push(inbound(7, 2_006_000, false))

    assert.deepEqual(
        FakeVideoDecoder.all[0].decodes.map((chunk) => chunk.timestamp),
        [0, 66_667, 66_678, 133_344, 133_356, 200_022]
    )
})

test('decoded pictures go to onFrame with their SSRC; one that throws is closed and reported', (t) => {
    installFakeWebCodecs(t)
    const errors: unknown[] = []
    let throwNext = false
    const seen: number[] = []
    const receiver = new WaWebCallVideoReceiver({
        onFrame: (_picture, ssrc) => {
            if (throwNext) throw new Error('render failed')
            seen.push(ssrc)
        },
        onError: (error) => errors.push(error)
    })
    t.after(() => receiver.close())
    receiver.push(inbound(9, 0, true))
    const [decoder] = FakeVideoDecoder.all

    decoder.output()
    throwNext = true
    const failed = decoder.output()

    assert.deepEqual(seen, [9])
    assert.equal(failed.closed, true)
    assert.equal(errors.length, 1)
    assert.equal(receiver.stats.framesDecoded, 2)
})

test('a decoder failure waits for the next key frame and opens a new decoder', (t) => {
    const { receiver, errors } = startReceiver(t)
    receiver.push(inbound(7, 0, true))
    const failure = new Error('corrupt')
    FakeVideoDecoder.all[0].fail(failure)
    assert.deepEqual(errors, [{ error: failure, ssrc: 7 }])

    receiver.push(inbound(7, 6_000, false))
    assert.equal(FakeVideoDecoder.all.length, 1, 'a delta does not reopen the stream')
    receiver.push(inbound(7, 12_000, true))

    assert.equal(FakeVideoDecoder.all.length, 2)
    assert.deepEqual(
        FakeVideoDecoder.all[1].decodes.map((chunk) => chunk.type),
        ['key']
    )
    assert.equal(receiver.stats.decodeErrors, 1)
    assert.equal(receiver.stats.framesDropped, 1)
})

test('a decoder that refuses the configuration drops the key frame and waits for the next', (t) => {
    const { receiver, errors } = startReceiver(t)
    const original = FakeVideoDecoder.prototype.configure
    FakeVideoDecoder.prototype.configure = function () {
        throw new Error('unsupported')
    }
    receiver.push(inbound(7, 0, true))
    FakeVideoDecoder.prototype.configure = original
    receiver.push(inbound(7, 6_000, false))
    receiver.push(inbound(7, 12_000, true))

    assert.equal(errors.length, 1)
    assert.equal(FakeVideoDecoder.all[0].state, 'closed')
    assert.deepEqual(
        FakeVideoDecoder.all[1].decodes.map((chunk) => chunk.type),
        ['key']
    )
    assert.equal(receiver.stats.framesDropped, 2)
})

test('a decoder backlog cuts the stream back to its next key frame', (t) => {
    const { receiver } = startReceiver(t)
    receiver.push(inbound(7, 0, true))
    const [decoder] = FakeVideoDecoder.all
    decoder.decodeQueueSize = 31
    receiver.push(inbound(7, 6_000, false))
    decoder.decodeQueueSize = 0
    receiver.push(inbound(7, 12_000, false))
    receiver.push(inbound(7, 18_000, true))

    assert.deepEqual(
        decoder.decodes.map((chunk) => chunk.type),
        ['key', 'key'],
        'the deltas after the shed one are dropped too'
    )
    assert.equal(receiver.stats.framesDropped, 2)
})

test('each SSRC gets its own decoder, at most four, the oldest closed for a fifth', (t) => {
    const { receiver } = startReceiver(t)
    for (const ssrc of [1, 2, 3, 4, 5]) receiver.push(inbound(ssrc, 0, true))

    assert.equal(FakeVideoDecoder.all.length, 5)
    assert.deepEqual(
        FakeVideoDecoder.all.map((decoder) => decoder.state),
        ['closed', 'configured', 'configured', 'configured', 'configured']
    )
})

test('a key frame with another profile reconfigures the stream', (t) => {
    const { receiver } = startReceiver(t)
    receiver.push(inbound(7, 0, true))
    const high = [0, 0, 0, 1, 0x67, 0x64, 0x00, 0x28, 0, 0, 1, 0x65, 0x88]
    receiver.push(inbound(7, 6_000, true, high))

    assert.equal(FakeVideoDecoder.all[0].state, 'closed')
    assert.deepEqual(FakeVideoDecoder.all[1].configs, [
        { codec: 'avc1.640028', optimizeForLatency: true }
    ])
})

test('close closes every decoder and ignores frames after', (t) => {
    const { receiver } = startReceiver(t)
    receiver.push(inbound(1, 0, true))
    receiver.push(inbound(2, 0, true))
    receiver.close()
    receiver.push(inbound(1, 6_000, true))

    assert.deepEqual(
        FakeVideoDecoder.all.map((decoder) => decoder.state),
        ['closed', 'closed']
    )
    assert.equal(receiver.stats.framesReceived, 2)
})

test('readH264Codec reads the SPS behind either start code, and finds none in a delta', () => {
    assert.equal(readH264Codec(Uint8Array.from(KEY_FRAME)), 'avc1.42C01F')
    assert.equal(
        readH264Codec(
            Uint8Array.from([0, 0, 1, 0x09, 0xf0, 0, 0, 1, 0x67, 0x4d, 0x40, 0x1e, 0x9a])
        ),
        'avc1.4D401E'
    )
    assert.equal(readH264Codec(Uint8Array.from(DELTA_FRAME)), null)
    assert.equal(readH264Codec(Uint8Array.from([0, 0, 1, 0x67, 0x42])), null, 'a cut-off SPS')
})

test('a hardware preference reaches the encoder and the decoder configurations', async (t) => {
    const { clock, processor, encoder } = await startSender(t, {
        hardwareAcceleration: 'prefer-software'
    })
    clock.nowMs = 1_000
    processor.push(640, 480)
    await settle()
    assert.equal(encoder().configs[0].hardwareAcceleration, 'prefer-software')

    const receiver = new WaWebCallVideoReceiver({
        onFrame: (picture) => picture.close(),
        hardwareAcceleration: 'prefer-software'
    })
    t.after(() => receiver.close())
    receiver.push(inbound(7, 0, true))
    assert.deepEqual(FakeVideoDecoder.all[0].configs, [
        { codec: 'avc1.42C01F', optimizeForLatency: true, hardwareAcceleration: 'prefer-software' }
    ])
})
