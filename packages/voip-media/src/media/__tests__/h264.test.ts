import assert from 'node:assert/strict'
import test from 'node:test'

import { H264Depacketizer, isH264KeyFrame, packetizeH264AnnexB } from '../h264.js'

test('reassembles a single IDR NAL as Annex-B', () => {
    const d = new H264Depacketizer()
    const [frame] = d.push(new Uint8Array([0x65, 1, 2]), 90, true, 0)
    assert.deepEqual(frame?.data, new Uint8Array([0, 0, 0, 1, 0x65, 1, 2]))
    assert.equal(frame?.keyFrame, true)
})

test('reassembles FU-A fragments', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x85, 1, 2]), 91, false, 10), [])
    const [frame] = d.push(new Uint8Array([0x7c, 0x45, 3, 4]), 91, true, 11)
    assert.deepEqual(frame?.data, new Uint8Array([0, 0, 0, 1, 0x65, 1, 2, 3, 4]))
    assert.equal(frame?.keyFrame, true)
})

test('expands STAP-A into Annex-B NAL units', () => {
    const d = new H264Depacketizer()
    const [frame] = d.push(new Uint8Array([24, 0, 2, 0x67, 1, 0, 2, 0x68, 2]), 92, true, 0)
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
        result =
            depacketizer.push(payloads[index], 123, index === payloads.length - 1, index)[0] ?? null
    }
    assert.deepEqual(result?.data, original)
    assert.equal(result?.keyFrame, true)
})

test('delivers both access units at a timestamp boundary', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x61, 1]), 100, false, 0), [])
    const frames = d.push(new Uint8Array([0x65, 2]), 101, true, 1)
    assert.equal(frames.length, 2)
    assert.equal(frames[0].timestamp, 100)
    assert.equal(frames[1].timestamp, 101)
})

test('drops an oversized incomplete FU-A access unit', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x85, 1]), 102, false, 0), [])
    const fragment = new Uint8Array(1026)
    fragment[0] = 0x7c
    fragment[1] = 0x05
    for (let index = 0; index < 8200; index++) d.push(fragment, 102, false, index + 1)
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x45, 2]), 102, true, 8201), [])
})

test('fragments a non-IDR slice into the FU-A bytes seen on the wire', () => {
    const unit = new Uint8Array([0, 0, 0, 1, 0x61, 1, 2, 3, 4, 5, 6])
    const packets = packetizeH264AnnexB(unit, 5)
    assert.equal(packets.length, 2)
    assert.deepEqual(packets[0], new Uint8Array([0x7c, 0x81, 1, 2, 3]))
    assert.deepEqual(packets[1], new Uint8Array([0x7c, 0x41, 4, 5, 6]))
})

test('reports a key frame only when an IDR NAL is present', () => {
    const parametersOnly = new Uint8Array([
        0, 0, 0, 1, 0x67, 0x42, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 0, 1, 0x61, 9, 9
    ])
    assert.equal(isH264KeyFrame(parametersOnly), false)
    const withIdr = new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0, 0, 1, 0x65, 9])
    assert.equal(isH264KeyFrame(withIdr), true)
})

test('treats a buffer without start codes as a single NAL', () => {
    assert.equal(isH264KeyFrame(new Uint8Array([0x65, 1, 2, 3])), true)
    assert.equal(isH264KeyFrame(new Uint8Array([0x61, 1, 2, 3])), false)
    assert.equal(isH264KeyFrame(new Uint8Array()), false)
})

test('keeps a completed IDR when a foreign timestamp interrupts a pending FU-A run', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x67, 0x42, 0x00, 0x1f]), 500, false, 0), [])
    assert.deepEqual(d.push(new Uint8Array([0x68, 0xce, 0x3c, 0x80]), 500, false, 1), [])
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x85, 0x11, 0x12]), 500, false, 2), [])
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x45, 0x13, 0x14]), 500, false, 3), [])
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x81, 0x21, 0x22]), 500, false, 4), [])
    const frames = d.push(new Uint8Array([0x41, 0x31]), 200, false, 5)
    assert.equal(
        frames.length,
        1,
        'a timestamp change while a FU-A run is mid-assembly discarded the whole access unit instead of emitting the NAL units that were already complete'
    )
    assert.deepEqual(
        frames[0]?.data,
        new Uint8Array([
            0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f, 0, 0, 0, 1, 0x68, 0xce, 0x3c, 0x80, 0, 0, 0, 1,
            0x65, 0x11, 0x12, 0x13, 0x14
        ])
    )
    assert.equal(
        frames[0]?.keyFrame,
        true,
        'the reassembled access unit carries an IDR NAL but was not reported as a key frame'
    )
})

test('does not report a key frame when the IDR fragments never reach the access unit', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x85, 0x11, 0x12]), 600, false, 0), [])
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x81, 0x21, 0x22]), 600, false, 1), [])
    const [frame] = d.push(new Uint8Array([0x7c, 0x41, 0x23, 0x24]), 600, true, 2)
    assert.deepEqual(frame?.data, new Uint8Array([0, 0, 0, 1, 0x61, 0x21, 0x22, 0x23, 0x24]))
    assert.equal(
        frame?.keyFrame,
        false,
        'an abandoned IDR fragment run leaked the key-frame flag onto an access unit that carries no IDR NAL'
    )
})

test('ignores FU-A fragments whose start fragment was lost', () => {
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x67, 0x42, 0x00, 0x1f]), 700, false, 0), [])
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x81, 0x21, 0x22]), 700, false, 1), [])
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x05, 0x31, 0x32]), 700, false, 2), [])
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x45, 0x33, 0x34]), 700, false, 3), [])
    const [frame] = d.push(new Uint8Array([0x41, 0x41]), 800, false, 4)
    assert.deepEqual(
        frame?.data,
        new Uint8Array([0, 0, 0, 1, 0x67, 0x42, 0x00, 0x1f]),
        'fragments of a NAL whose start fragment was lost were appended to an unrelated FU-A run, producing a corrupt NAL unit'
    )
    assert.equal(frame?.keyFrame, false)
})

test('does not splice a fragment across a sequence gap even when its NAL type matches the run in flight', () => {
    /**
     * Consecutive NALs commonly share a type (slices are all type 1), so
     * matching a continuation fragment by `fuNalType` alone cannot tell a real
     * continuation apart from an unrelated fragment that only happens to carry
     * the same type. Here the run in flight is left open (its own end fragment
     * never arrives) and a later, unrelated end-marked fragment of the same
     * type arrives after a large sequence gap: without the sequence check this
     * used to splice the two together into one corrupt NAL.
     */
    const d = new H264Depacketizer()
    assert.deepEqual(d.push(new Uint8Array([0x7c, 0x81, 0xaa]), 900, false, 0), [])
    const frames = d.push(new Uint8Array([0x7c, 0x41, 0xbb]), 900, true, 50)
    assert.deepEqual(
        frames,
        [],
        'a fragment separated from the run in flight by a sequence gap was spliced onto it despite sharing its NAL type, producing a corrupt NAL unit'
    )
})
