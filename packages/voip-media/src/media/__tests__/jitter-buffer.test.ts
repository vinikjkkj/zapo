import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { WaCallMediaPlane } from '../../call/WaCallMediaPlane.js'
import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaJitterBuffer } from '../WaJitterBuffer.js'

/** The longest packet the MLow decoder produces: 120 ms, two aggregated frames, at 16 kHz. */
const MAX_PACKET_SAMPLES = 16 * 120 * 2

/** A queue that cannot take a whole packet drops part of it on every write. */
test('the call playout queue holds three of the largest packets the decoder produces', () => {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })

    assert.equal(MAX_PACKET_SAMPLES, 3840)
    assert.equal(plane.getStats().playout.capacity, MAX_PACKET_SAMPLES * 3)
    plane.stop()
})

test('samples come out in the order they went in', () => {
    const buffer = new WaJitterBuffer(MAX_PACKET_SAMPLES, createNoopLogger())
    buffer.write(new Float32Array([1, 2, 3]))
    buffer.write(new Float32Array([4, 5]))

    const out = new Float32Array(5)
    assert.equal(buffer.read(out), 5)
    assert.deepEqual([...out], [1, 2, 3, 4, 5])
    assert.equal(buffer.stats.buffered, 0)
})

/** Samples numbered in the order they were written, so the ones dropped can be named. */
function numbered(from: number, length: number): Float32Array {
    const samples = new Float32Array(length)
    for (let i = 0; i < length; i++) samples[i] = from + i
    return samples
}

test('a full queue drops the oldest audio, not the newest', () => {
    const buffer = new WaJitterBuffer(MAX_PACKET_SAMPLES, createNoopLogger())

    buffer.write(numbered(0, MAX_PACKET_SAMPLES))
    buffer.write(numbered(MAX_PACKET_SAMPLES, 960))

    assert.equal(buffer.stats.buffered, MAX_PACKET_SAMPLES)
    assert.equal(buffer.stats.dropped, 960)
    const out = new Float32Array(MAX_PACKET_SAMPLES)
    buffer.read(out)
    assert.deepEqual(out, numbered(960, MAX_PACKET_SAMPLES), 'the first 960 written are gone')
})

test('a capacity that is not a positive integer is refused', () => {
    for (const capacity of [0, -1, 1.5, Number.NaN]) {
        assert.throws(() => new WaJitterBuffer(capacity, createNoopLogger()), RangeError)
    }
})

test('a write larger than the queue keeps only its tail', () => {
    const buffer = new WaJitterBuffer(4, createNoopLogger())

    buffer.write(new Float32Array([1, 2, 3, 4, 5, 6]))

    const out = new Float32Array(4)
    buffer.read(out)
    assert.deepEqual([...out], [3, 4, 5, 6])
    assert.equal(buffer.stats.dropped, 2)
})

test('a short queue pads the read with silence and counts it', () => {
    const buffer = new WaJitterBuffer(16, createNoopLogger())
    buffer.write(new Float32Array([0.5, 0.5]))

    const out = new Float32Array(4).fill(9)
    assert.equal(buffer.read(out), 2)
    assert.deepEqual([...out], [0.5, 0.5, 0, 0])
    assert.equal(buffer.stats.underruns, 1)
})

test('the queue wraps around its end without losing order', () => {
    const buffer = new WaJitterBuffer(4, createNoopLogger())
    const out = new Float32Array(3)
    buffer.write(new Float32Array([1, 2, 3]))
    buffer.read(out)

    buffer.write(new Float32Array([4, 5, 6]))

    assert.equal(buffer.read(out), 3)
    assert.deepEqual([...out], [4, 5, 6])
})

test('reset empties the queue and keeps the counters', () => {
    const buffer = new WaJitterBuffer(2, createNoopLogger())
    buffer.write(new Float32Array([1, 2, 3]))

    buffer.reset()

    assert.equal(buffer.stats.buffered, 0)
    assert.equal(buffer.stats.dropped, 1)
})
