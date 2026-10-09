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

/** WhatsApp's key frame: one FU-A typed SPS, with the PPS and the IDR inside it in Annex-B. */
const SPS_TYPED_KEY_FRAME_BODY = [0x42, 0xc0, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 1, 0x65, 0x88, 0x84]

test('reports a key frame whose IDR rides inside an FU-A typed SPS', () => {
    const d = new H264Depacketizer()
    const [frame] = d.push(new Uint8Array([0x7c, 0xc7, ...SPS_TYPED_KEY_FRAME_BODY]), 93, true, 0)
    assert.deepEqual(frame?.data, new Uint8Array([0, 0, 0, 1, 0x67, ...SPS_TYPED_KEY_FRAME_BODY]))
    assert.equal(frame?.keyFrame, true)

    const split = new H264Depacketizer()
    split.push(new Uint8Array([0x7c, 0x87, ...SPS_TYPED_KEY_FRAME_BODY.slice(0, 5)]), 94, false, 7)
    split.push(new Uint8Array([0x7c, 0x07, ...SPS_TYPED_KEY_FRAME_BODY.slice(5, 10)]), 94, false, 8)
    const [joined] = split.push(
        new Uint8Array([0x7c, 0x47, ...SPS_TYPED_KEY_FRAME_BODY.slice(10)]),
        94,
        true,
        9
    )
    assert.equal(joined?.keyFrame, true, 'a start code split across fragments still counts')
})

test('a parameter set carrying only a delta slice inside is no key frame', () => {
    const d = new H264Depacketizer()
    const body = [0x42, 0xc0, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 0, 1, 0x41, 0x9a]
    const [frame] = d.push(new Uint8Array([0x7c, 0xc7, ...body]), 95, true, 0)
    assert.equal(frame?.keyFrame, false)
})

const SEI = [0x06, 0x05, 0x01, 0xaa, 0x80]
const SPS = [0x67, 0x42, 0xc0, 0x1f]
const PPS = [0x68, 0xce, 0x3c, 0x80]
const DELTA_SLICE = [0x41, 0x9a, 0x02]

function stapA(...nals: number[][]): Uint8Array {
    const bytes = [24]
    for (const nal of nals) bytes.push(nal.length >> 8, nal.length & 0xff, ...nal)
    return new Uint8Array(bytes)
}

test('a delta with SEI or repeated parameter sets is no key frame', () => {
    const d = new H264Depacketizer()
    assert.equal(d.push(stapA(SEI, DELTA_SLICE), 96, true, 0)[0]?.keyFrame, false)
    assert.equal(d.push(stapA(SPS, PPS, DELTA_SLICE), 97, true, 1)[0]?.keyFrame, false)
    assert.equal(d.push(stapA(SPS, PPS, [0x65, 0x88]), 98, true, 2)[0]?.keyFrame, true)
})

/** A conforming NAL never holds a start code, so one outside an SPS is noise, not an IDR. */
test('only the bytes of an SPS are scanned for an IDR inside', () => {
    const d = new H264Depacketizer()
    const seiWithStartCode = [0x06, 0, 0, 0, 1, 0x65, 0x88]
    assert.equal(d.push(stapA(seiWithStartCode, DELTA_SLICE), 99, true, 0)[0]?.keyFrame, false)
    const sliceWithStartCode = [0x41, 0, 0, 1, 0x65, 0x88]
    const [frame] = d.push(stapA(SPS, PPS, sliceWithStartCode), 100, true, 1)
    assert.equal(frame?.keyFrame, false)
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

const annexB = (...nals: number[][]): Uint8Array => {
    const bytes: number[] = []
    for (const nal of nals) bytes.push(0, 0, 0, 1, ...nal)
    return new Uint8Array(bytes)
}
const IDR_SLICE = [0x65, 0x88, 0x84, 0x21]

test('a key frame [SPS, PPS, IDR] goes out as [STAP-A(SPS, PPS), IDR], never [SPS, PPS, IDR]', () => {
    const payloads = packetizeH264AnnexB(annexB(SPS, PPS, IDR_SLICE), 800)
    assert.deepEqual(payloads, [
        stapA(SPS, PPS).map((b, i) => (i === 0 ? 0x60 | 24 : b)),
        new Uint8Array(IDR_SLICE)
    ])
    assert.notDeepEqual(
        payloads.map((p) => p[0] & 0x1f),
        [7, 8, 5]
    )
})

test('the STAP-A carries each parameter set byte-exact behind its big-endian size', () => {
    const sps = [0x67, 0x4d, 0x40, 0x1f, ...Array.from({ length: 300 }, (_, i) => (i % 254) + 1)]
    const pps = [0x68, 0xee, 0x3c, 0x80]
    const [stap, idr] = packetizeH264AnnexB(annexB(sps, pps, IDR_SLICE), 800)
    assert.equal(stap[0] & 0x1f, 24)
    assert.equal(stap[0] & 0x80, 0, 'F clear')
    assert.equal((stap[1] << 8) | stap[2], sps.length)
    assert.equal(sps.length, 304, 'a size above 255 exercises both size bytes')
    assert.deepEqual(stap.subarray(3, 3 + sps.length), new Uint8Array(sps))
    const at = 3 + sps.length
    assert.equal((stap[at] << 8) | stap[at + 1], pps.length)
    assert.deepEqual(stap.subarray(at + 2), new Uint8Array(pps))
    assert.equal(stap.length, 1 + 2 + sps.length + 2 + pps.length)
    assert.deepEqual(idr, new Uint8Array(IDR_SLICE))
})

test('the STAP-A NRI is the larger of the two parameter sets', () => {
    const [low] = packetizeH264AnnexB(annexB([0x27, 1], [0x48, 2], IDR_SLICE), 800)
    assert.equal(low[0], 0x40 | 24)
    const [high] = packetizeH264AnnexB(annexB([0x67, 1], [0x08, 2], IDR_SLICE), 800)
    assert.equal(high[0], 0x60 | 24)
})

test('a large IDR still fragments into FU-A behind the STAP-A, within the payload budget', () => {
    const idr = [0x65, ...Array.from({ length: 2000 }, (_, i) => i & 0xff)]
    const payloads = packetizeH264AnnexB(annexB(SPS, PPS, idr), 800)
    assert.equal(payloads[0][0] & 0x1f, 24)
    const fragments = payloads.slice(1)
    assert.ok(fragments.length > 1)
    assert.ok(fragments.every((p) => (p[0] & 0x1f) === 28 && (p[1] & 0x1f) === 5))
    assert.equal(fragments[0][1] & 0x80, 0x80, 'start bit on the first fragment')
    assert.equal((fragments.at(-1)?.[1] ?? 0) & 0x40, 0x40, 'end bit on the last fragment')
    assert.ok(payloads.every((p) => p.length <= 800))
})

test('units around the pair keep their own payloads and order', () => {
    const payloads = packetizeH264AnnexB(annexB(SPS, PPS, SEI, IDR_SLICE), 800)
    assert.deepEqual(
        payloads.map((p) => p[0] & 0x1f),
        [24, 6, 5]
    )
    assert.deepEqual(payloads[1], new Uint8Array(SEI))
})

test('a delta or an access unit without the pair is packetized as before', () => {
    assert.deepEqual(packetizeH264AnnexB(annexB(DELTA_SLICE), 800), [new Uint8Array(DELTA_SLICE)])
    assert.deepEqual(packetizeH264AnnexB(annexB(SEI, DELTA_SLICE), 800), [
        new Uint8Array(SEI),
        new Uint8Array(DELTA_SLICE)
    ])
    assert.deepEqual(packetizeH264AnnexB(annexB(IDR_SLICE), 800), [new Uint8Array(IDR_SLICE)])
})

test('anything but an SPS directly followed by a PPS is not aggregated', () => {
    const types = (au: Uint8Array): number[] => packetizeH264AnnexB(au, 800).map((p) => p[0] & 0x1f)
    assert.deepEqual(types(annexB(SPS, IDR_SLICE)), [7, 5], 'lone SPS')
    assert.deepEqual(types(annexB(PPS, IDR_SLICE)), [8, 5], 'lone PPS')
    assert.deepEqual(types(annexB(PPS, SPS, IDR_SLICE)), [8, 7, 5], 'PPS before SPS')
    assert.deepEqual(types(annexB(SPS, SEI, PPS, IDR_SLICE)), [7, 6, 8, 5], 'not adjacent')
    const forbiddenSps = [0x80 | 0x67, 1]
    assert.deepEqual(
        packetizeH264AnnexB(annexB(forbiddenSps, PPS, IDR_SLICE), 800).map((p) => p[0]),
        [0xe7, PPS[0], IDR_SLICE[0]],
        'a unit with the forbidden bit set is left alone'
    )
})

test('each SPS directly followed by a PPS gets its own STAP-A, and nothing is duplicated or dropped', () => {
    const types = (au: Uint8Array): number[] => packetizeH264AnnexB(au, 800).map((p) => p[0] & 0x1f)
    assert.deepEqual(types(annexB(SPS, PPS, SPS, PPS, IDR_SLICE)), [24, 24, 5])
    assert.deepEqual(types(annexB(SPS, SPS, PPS, IDR_SLICE)), [7, 24, 5])
    assert.deepEqual(types(annexB(SPS, PPS, PPS, IDR_SLICE)), [24, 8, 5])
    const original = annexB(SPS, SPS, PPS, PPS, IDR_SLICE)
    const payloads = packetizeH264AnnexB(original, 800)
    const depacketizer = new H264Depacketizer()
    const frames = payloads.flatMap((payload, index) =>
        depacketizer.push(payload, 322, index === payloads.length - 1, index)
    )
    assert.deepEqual(frames[0]?.data, original)
})

test('a pair that does not fit one payload keeps the single-NAL and FU-A path', () => {
    // 1 + 2 + 4 + 2 + 4 = 13 bytes would exceed a 12-byte budget.
    const payloads = packetizeH264AnnexB(annexB(SPS, PPS, IDR_SLICE), 12)
    assert.deepEqual(
        payloads.map((p) => p[0] & 0x1f),
        [7, 8, 5]
    )
    assert.ok(packetizeH264AnnexB(annexB(SPS, PPS, IDR_SLICE), 13)[0][0] === (0x60 | 24))
})

test('a parameter set too large for the 16-bit STAP-A size field is never aggregated', () => {
    const hugeSps = new Uint8Array(0x10000)
    hugeSps[0] = 0x67
    hugeSps.fill(1, 1)
    const au = new Uint8Array(4 + hugeSps.length + 4 + PPS.length)
    au.set([0, 0, 0, 1])
    au.set(hugeSps, 4)
    au.set([0, 0, 0, 1, ...PPS], 4 + hugeSps.length)
    const payloads = packetizeH264AnnexB(au, 0x20000)
    assert.deepEqual(
        payloads.map((p) => p[0] & 0x1f),
        [7, 8]
    )
    assert.equal(payloads[0].length, hugeSps.length)
})

test('the STAP-A output round-trips through the depacketizer as the same access unit', () => {
    const original = annexB(SPS, PPS, IDR_SLICE)
    const payloads = packetizeH264AnnexB(original, 800)
    const depacketizer = new H264Depacketizer()
    const frames = payloads.flatMap((payload, index) =>
        depacketizer.push(payload, 321, index === payloads.length - 1, index)
    )
    assert.equal(frames.length, 1)
    assert.deepEqual(frames[0].data, original)
    assert.equal(frames[0].keyFrame, true)
})
