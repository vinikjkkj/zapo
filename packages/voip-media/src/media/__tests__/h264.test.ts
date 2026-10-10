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
    const unit = new Uint8Array([0, 0, 0, 1, 0x67, 1, 0, 0, 1, 0x61, 2, 3, 4, 5, 6, 7])
    const packets = packetizeH264AnnexB(unit, 5)
    assert.deepEqual(packets[0], new Uint8Array([0x67, 1]))
    assert.deepEqual(packets[1], new Uint8Array([0x7c, 0x81, 2, 3, 4]))
    assert.deepEqual(packets[2], new Uint8Array([0x7c, 0x41, 5, 6, 7]))
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
const AUD = [0x09, 0xf0]
/** A STAP-A of `nals` under the header a key frame gets: F clear, NRI 3. */
const keyFrameStapA = (...nals: number[][]): Uint8Array => {
    const payload = stapA(...nals)
    payload[0] = 0x78
    return payload
}
/** SPS, PPS and IDR behind the start codes an encoder may mix, four and three bytes. */
const KEY_FRAME_UNIT = new Uint8Array([
    ...[0, 0, 0, 1, ...SPS],
    ...[0, 0, 0, 1, ...PPS],
    ...[0, 0, 1, 0x65, 0x88, 0x84, 0x21, 0x22, 0x23, 0x24, 0x25]
])
/** The key frame after its first start code and first NAL header byte. */
const KEY_FRAME_BODY = KEY_FRAME_UNIT.subarray(5)

test('a key frame that fits one payload goes out as one STAP-A of its SPS, PPS and IDR', () => {
    assert.deepEqual(packetizeH264AnnexB(annexB(SPS, PPS, IDR_SLICE), 800), [
        new Uint8Array([0x78, 0, 4, ...SPS, 0, 4, ...PPS, 0, 4, ...IDR_SLICE])
    ])
})

test('the STAP-A carries every unit byte-exact behind its big-endian size', () => {
    const sps = [0x67, 0x4d, 0x40, 0x1f, ...Array.from({ length: 300 }, (_, i) => (i % 254) + 1)]
    const pps = [0x68, 0xee, 0x3c, 0x80]
    const [stap, ...rest] = packetizeH264AnnexB(annexB(sps, pps, IDR_SLICE), 800)
    assert.deepEqual(rest, [])
    assert.equal(stap[0] & 0x1f, 24)
    assert.equal(sps.length, 304, 'a size above 255 exercises both size bytes')
    assert.deepEqual(stap.subarray(1, 3), new Uint8Array([0x01, 0x30]))
    let at = 1
    for (const nal of [sps, pps, IDR_SLICE]) {
        assert.equal((stap[at] << 8) | stap[at + 1], nal.length)
        assert.deepEqual(stap.subarray(at + 2, at + 2 + nal.length), new Uint8Array(nal))
        at += 2 + nal.length
    }
    assert.equal(stap.length, at)
})

test('the STAP-A takes the largest NRI of its units and the forbidden bit of any', () => {
    const header = (...nals: number[][]): number => packetizeH264AnnexB(annexB(...nals), 800)[0][0]
    assert.equal(header([0x27, 1], [0x48, 2], [0x25, 3]), 0x40 | 24)
    assert.equal(header([0x67, 1], [0x08, 2], [0x25, 3]), 0x60 | 24)
    assert.equal(header(SPS, PPS, IDR_SLICE) & 0x80, 0, 'F clear when every unit has it clear')
    assert.equal(header([0x27, 1], [0x08, 2], [0xa5, 3]), 0x80 | 0x20 | 24, 'F set by any unit')
})

test('the STAP-A keeps every unit of the access unit in order, none duplicated or dropped', () => {
    assert.deepEqual(packetizeH264AnnexB(annexB(SPS, PPS, SEI, IDR_SLICE), 800), [
        keyFrameStapA(SPS, PPS, SEI, IDR_SLICE)
    ])
    const repeated = annexB(SPS, SPS, PPS, PPS, IDR_SLICE)
    const payloads = packetizeH264AnnexB(repeated, 800)
    assert.deepEqual(payloads, [keyFrameStapA(SPS, SPS, PPS, PPS, IDR_SLICE)])
    const [frame] = new H264Depacketizer().push(payloads[0], 322, true, 0)
    assert.deepEqual(frame?.data, repeated)
})

test('a key frame over the payload budget opens with the FU-A typed SPS the official clients send', () => {
    const [first] = packetizeH264AnnexB(KEY_FRAME_UNIT, 8)
    assert.deepEqual(first, new Uint8Array([0x7c, 0x87, ...KEY_FRAME_BODY.subarray(0, 6)]))
    assert.deepEqual(first.subarray(0, 3), new Uint8Array([0x7c, 0x87, 0x42]))

    const lowPriority = KEY_FRAME_UNIT.slice()
    lowPriority[4] = 0x27
    assert.equal(packetizeH264AnnexB(lowPriority, 8)[0][0], 0x3c, 'F and NRI come from the SPS')
})

test('carries the rest of the key frame in FU-A fragments, start codes and all', () => {
    const packets = packetizeH264AnnexB(KEY_FRAME_UNIT, 8)
    assert.deepEqual(
        packets.map((packet) => packet.subarray(0, 2)),
        [
            new Uint8Array([0x7c, 0x87]),
            new Uint8Array([0x7c, 0x07]),
            new Uint8Array([0x7c, 0x07]),
            new Uint8Array([0x7c, 0x47])
        ]
    )
    assert.deepEqual(
        new Uint8Array(packets.flatMap((packet) => [...packet.subarray(2)])),
        KEY_FRAME_BODY
    )
    assert.ok(packets.every((packet) => packet.length <= 8))
})

test('a key frame one byte over the STAP-A budget goes out as FU-A typed SPS', () => {
    const unit = annexB(SPS, PPS, IDR_SLICE)
    const stapSize = 1 + 3 * (2 + 4)
    assert.deepEqual(
        packetizeH264AnnexB(unit, stapSize).map((payload) => payload[0]),
        [0x78]
    )
    const fragments = packetizeH264AnnexB(unit, stapSize - 1)
    assert.deepEqual(
        fragments.map((payload) => payload.subarray(0, 2)),
        [new Uint8Array([0x7c, 0x87]), new Uint8Array([0x7c, 0x47])]
    )
    assert.ok(fragments.every((payload) => payload.length < stapSize))
})

test('a unit too large for the 16-bit STAP-A size field sends the key frame as FU-A typed SPS', () => {
    const withIdrOf = (length: number): Uint8Array => {
        const head = annexB(SPS, PPS, [0x65])
        const unit = new Uint8Array(head.length + length - 1).fill(1)
        unit.set(head)
        return unit
    }
    assert.deepEqual(
        packetizeH264AnnexB(withIdrOf(0xffff), 0x20000).map((payload) => payload[0]),
        [0x78]
    )
    const [whole, ...rest] = packetizeH264AnnexB(withIdrOf(0x10000), 0x20000)
    assert.deepEqual(rest, [])
    assert.deepEqual(whole.subarray(0, 3), new Uint8Array([0x7c, 0xc7, 0x42]))
})

test('what precedes the SPS joins the STAP-A, or goes ahead of the FU-A as before', () => {
    assert.deepEqual(packetizeH264AnnexB(annexB(AUD, SPS, PPS, IDR_SLICE), 800), [
        keyFrameStapA(AUD, SPS, PPS, IDR_SLICE)
    ])
    const delimited = new Uint8Array([0, 0, 0, 1, ...AUD, ...KEY_FRAME_UNIT])
    const [delimiter, first] = packetizeH264AnnexB(delimited, 8)
    assert.deepEqual(delimiter, new Uint8Array(AUD))
    assert.deepEqual(first.subarray(0, 3), new Uint8Array([0x7c, 0x87, 0x42]))
})

test('leaves deltas and access units without an SPS ahead of an IDR as they were', () => {
    const slice = [...DELTA_SLICE, 0x11, 0x12, 0x13, 0x14]
    const sliceFragments = [
        new Uint8Array([0x5c, 0x81, 0x9a, 0x02, 0x11]),
        new Uint8Array([0x5c, 0x41, 0x12, 0x13, 0x14])
    ]
    assert.deepEqual(packetizeH264AnnexB(annexB(slice), 5), sliceFragments)
    assert.deepEqual(packetizeH264AnnexB(annexB(SPS, PPS, slice), 5), [
        new Uint8Array(SPS),
        new Uint8Array(PPS),
        ...sliceFragments
    ])
    assert.deepEqual(packetizeH264AnnexB(annexB(SPS, PPS, DELTA_SLICE), 800), [
        new Uint8Array(SPS),
        new Uint8Array(PPS),
        new Uint8Array(DELTA_SLICE)
    ])
    assert.deepEqual(packetizeH264AnnexB(annexB(SEI, DELTA_SLICE), 800), [
        new Uint8Array(SEI),
        new Uint8Array(DELTA_SLICE)
    ])
    assert.deepEqual(packetizeH264AnnexB(annexB([0x65, 0x88, 0x84, 0x11, 0x12, 0x13]), 5), [
        new Uint8Array([0x7c, 0x85, 0x88, 0x84, 0x11]),
        new Uint8Array([0x7c, 0x45, 0x12, 0x13])
    ])
    const types = (unit: Uint8Array): number[] =>
        packetizeH264AnnexB(unit, 800).map((payload) => payload[0] & 0x1f)
    assert.deepEqual(types(annexB(PPS, IDR_SLICE)), [8, 5], 'no SPS')
    assert.deepEqual(types(annexB(IDR_SLICE, SPS, PPS)), [5, 7, 8], 'SPS after the IDR')
})

test('both key frame shapes come back whole and flagged through our own depacketizer', () => {
    const shapes = [
        { unit: annexB(SPS, PPS, IDR_SLICE), maxPayload: 800, type: 24 },
        { unit: KEY_FRAME_UNIT, maxPayload: 8, type: 28 }
    ]
    for (const { unit, maxPayload, type } of shapes) {
        const payloads = packetizeH264AnnexB(unit, maxPayload)
        assert.ok(payloads.every((payload) => (payload[0] & 0x1f) === type))
        const d = new H264Depacketizer()
        const frames = payloads.flatMap((payload, index) =>
            d.push(payload, 124, index === payloads.length - 1, 40 + index)
        )
        assert.equal(frames.length, 1)
        assert.deepEqual(frames[0].data, unit)
        assert.equal(frames[0].keyFrame, true)
    }
})
