import assert from 'node:assert/strict'
import { test, type TestContext } from 'node:test'

import { WaWebCallVideoReceiver } from '../WaWebCallVideoReceiver.js'

import {
    FakeVideoDecoder,
    type FakeVideoFrame,
    inbound,
    installFakeWebCodecs,
    KEY_FRAME
} from './_webcodecs-fakes.js'

function startReceiver(
    t: TestContext,
    maxStreams?: number
): {
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
        onError: (error, ssrc) => errors.push({ error, ssrc }),
        maxStreams
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

test('a group call raises the decoders held at once with maxStreams', (t) => {
    const { receiver } = startReceiver(t, 6)
    for (const ssrc of [1, 2, 3, 4, 5, 6, 7]) receiver.push(inbound(ssrc, 0, true))

    assert.deepEqual(
        FakeVideoDecoder.all.map((decoder) => decoder.state),
        [
            'closed',
            'configured',
            'configured',
            'configured',
            'configured',
            'configured',
            'configured'
        ]
    )
})

test('a maxStreams that is not a number keeps the default of four', (t) => {
    const { receiver } = startReceiver(t, Number.NaN)
    for (const ssrc of [1, 2, 3, 4, 5]) receiver.push(inbound(ssrc, 0, true))

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
