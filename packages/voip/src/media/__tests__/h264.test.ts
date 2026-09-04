import assert from 'node:assert/strict'
import test from 'node:test'

import { H264Depacketizer, packetizeH264AnnexB } from '../h264.js'

test('reassembles a single IDR NAL as Annex-B', () => {
    const d = new H264Depacketizer()
    const [frame] = d.push(new Uint8Array([0x65, 1, 2]), 90, true)
    assert.deepEqual(frame?.data, new Uint8Array([0, 0, 0, 1, 0x65, 1, 2]))
    assert.equal(frame?.keyFrame, true)
})

test('reassembles FU-A fragments', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x85, 1, 2]), 91, false), [])
    const [frame] = d.push(new Uint8Array([0x7c, 0x45, 3, 4]), 91, true)
    assert.deepEqual(frame?.data, new Uint8Array([0, 0, 0, 1, 0x65, 1, 2, 3, 4]))
    assert.equal(frame?.keyFrame, true)
})

test('expands STAP-A into Annex-B NAL units', () => {
    const d = new H264Depacketizer()
    const [frame] = d.push(new Uint8Array([24, 0, 2, 0x67, 1, 0, 2, 0x68, 2]), 92, true)
    assert.deepEqual(frame?.data, new Uint8Array([0, 0, 0, 1, 0x67, 1, 0, 0, 0, 1, 0x68, 2]))
})

test('packetizes Annex-B NAL units and marks FU-A boundaries', () => {
    const unit = new Uint8Array([0, 0, 0, 1, 0x67, 1, 0, 0, 1, 0x65, 2, 3, 4, 5, 6, 7])
    const packets = packetizeH264AnnexB(unit, 5)
    assert.deepEqual(packets[0], new Uint8Array([0x67, 1]))
    assert.deepEqual(packets[1], new Uint8Array([0x7c, 0x85, 2, 3, 4]))
    assert.deepEqual(packets[2], new Uint8Array([0x7c, 0x45, 5, 6, 7]))
})

test('packetizer output round-trips through depacketizer', () => {
    const original = new Uint8Array([0, 0, 0, 1, 0x65, 1, 2, 3, 4, 5, 6, 7, 8])
    const payloads = packetizeH264AnnexB(original, 5)
    const depacketizer = new H264Depacketizer()
    let result = null
    for (let index = 0; index < payloads.length; index++) {
        result = depacketizer.push(payloads[index], 123, index === payloads.length - 1)[0] ?? null
    }
    assert.deepEqual(result?.data, original)
    assert.equal(result?.keyFrame, true)
})

test('delivers both access units at a timestamp boundary', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x61, 1]), 100, false), [])
    const frames = d.push(new Uint8Array([0x65, 2]), 101, true)
    assert.equal(frames.length, 2)
    assert.equal(frames[0].timestamp, 100)
    assert.equal(frames[1].timestamp, 101)
})

test('drops an oversized incomplete FU-A access unit', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x85, 1]), 102, false), [])
    const fragment = new Uint8Array(1026)
    fragment[0] = 0x7c
    fragment[1] = 0x05
    for (let index = 0; index < 8200; index++) d.push(fragment, 102, false)
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x45, 2]), 102, true), [])
})
