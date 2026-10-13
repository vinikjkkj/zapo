import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import type { WaCallMediaPlane } from '../../call/WaCallMediaPlane.js'
import { WaWebCallVideoReceiver } from '../WaWebCallVideoReceiver.js'
import {
    type WaCallVideoSink,
    WaWebCallVideoSender,
    type WaWebCallVideoSenderOptions
} from '../WaWebCallVideoSender.js'

import {
    type FakeClock,
    FakeProcessor,
    FakeTrack,
    FakeVideoDecoder,
    FakeVideoEncoder,
    FakeVideoFrame,
    inbound,
    installFakeWebCodecs,
    settle
} from './_webcodecs-fakes.js'

/** The plane is the sink the sender is written for; this stops compiling if they part. */
const planeIsASink: WaCallMediaPlane extends WaCallVideoSink ? true : never = true
void planeIsASink

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
    encoder().emit('delta', 100_001, [0, 0, 1, 0x41])
    assert.deepEqual(
        sink.sent[1],
        { data: [0, 0, 1, 0x41], timestampUs: 100_001 },
        'a shorter chunk after a longer one is passed at its own length'
    )
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
