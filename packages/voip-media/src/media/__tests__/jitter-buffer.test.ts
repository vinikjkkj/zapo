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

test('a full queue drops the oldest audio, not the newest', () => {
    const buffer = new WaJitterBuffer(MAX_PACKET_SAMPLES, createNoopLogger())

    buffer.write(new Float32Array(MAX_PACKET_SAMPLES).fill(0.25))
    buffer.write(new Float32Array(960).fill(0.5))

    assert.equal(buffer.stats.buffered, MAX_PACKET_SAMPLES)
    assert.equal(buffer.stats.dropped, 960)
    const out = new Float32Array(MAX_PACKET_SAMPLES)
    buffer.read(out)
    assert.equal(out[0], 0.25)
    assert.equal(out[MAX_PACKET_SAMPLES - 960 - 1], 0.25)
    assert.equal(out[MAX_PACKET_SAMPLES - 960], 0.5, 'the newest audio is the last to play')
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
