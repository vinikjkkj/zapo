import assert from 'node:assert/strict'
import test from 'node:test'

import { readUInt16BE, readUInt32BE } from '../../bytes.js'
import {
    buildFullIntraRequest,
    buildPictureLossIndication,
    buildReceiverEstimatedMaxBitrate,
    buildSenderReportWithSdes,
    senderReportSourceSsrc
} from '../rtcp.js'

const REPORT_BLOCK_OFFSET = 28
const REPORT_BLOCK_LENGTH = 32
/** Where the two WhatsApp words sit inside the first report block. */
const BLOCK_EXTENSION_OFFSET = REPORT_BLOCK_OFFSET + 24
/** Where the packet trailer sits behind a single report block. */
const PACKET_TRAILER_OFFSET = REPORT_BLOCK_OFFSET + REPORT_BLOCK_LENGTH
const SDES_OFFSET = 76
const SENDER_REPORT_LENGTH = 76
/** The same report built for a group: one block, and no packet trailer behind it. */
const GROUP_SENDER_REPORT_LENGTH = 60
const COMPOUND_LENGTH = 108
/** The profile bit the video sender report carries and the REMB does not. */
const VIDEO_PROFILE_BIT = 0x10
/**
 * Mask of the report block count in byte 0. It is five bits when the byte
 * does not carry the profile and four when it does, because the profile bit
 * occupies the fifth.
 */
const REPORT_COUNT_MASK = 0x1f
const VIDEO_REPORT_COUNT_MASK = 0x0f

const PEER_RECEPTION = {
    ssrc: 0x0a0b0c0d,
    fractionLost: 0x2a,
    packetsLost: 0x010203,
    highestSequence: 0xbeef,
    cycles: 3,
    jitter: 0x1234,
    lastSenderReport: 0xaabbccdd,
    delaySinceLastSenderReport: 0x0001_0000
} as const

/** A second source, to report on alongside {@link PEER_RECEPTION}. */
const OTHER_RECEPTION = { ...PEER_RECEPTION, ssrc: 0x11223344 } as const

/**
 * The compound report of one block, byte for byte, with the wall-clock NTP
 * field cleared. Repartitioning the sender report must not move a single byte
 * of it, because one block is what a one-to-one call sends and that packet is
 * what the capture validated.
 */
const ONE_BLOCK_IMAGE = new Uint8Array([
    0x81, 0xc8, 0x00, 0x12, 0x01, 0x02, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x0a, 0x0b, 0x0c, 0x0d, 0x00, 0x00, 0x00, 0x19, 0x00, 0x00, 0x09, 0x60, 0x0a, 0x0b, 0x0c, 0x0d,
    0x2a, 0x01, 0x02, 0x03, 0x00, 0x03, 0xbe, 0xef, 0x00, 0x00, 0x12, 0x34, 0xaa, 0xbb, 0xcc, 0xdd,
    0x00, 0x01, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04, 0x00, 0x02, 0x48, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x50, 0x00, 0x81, 0xca, 0x00, 0x07,
    0x01, 0x02, 0x03, 0x04, 0x01, 0x12, 0x32, 0x62, 0x33, 0x32, 0x33, 0x40, 0x70, 0x6a, 0x39, 0x34,
    0x30, 0x34, 0x37, 0x34, 0x2e, 0x6f, 0x72, 0x67, 0x00, 0x00, 0x00, 0x00
])

/** The CNAME seed {@link ONE_BLOCK_IMAGE} was captured under. */
function imageCname(): Uint8Array {
    const cname = new Uint8Array(18)
    for (let index = 0; index < cname.length; index++) cname[index] = index * 7 + 1
    return cname
}

/** A report with its NTP timestamp cleared, so two runs compare byte for byte. */
function withoutNtp(report: Uint8Array): Uint8Array {
    const stable = report.slice()
    stable.fill(0, 8, 16)
    return stable
}

test('builds a compound sender report carrying one SDES chunk', () => {
    const report = buildSenderReportWithSdes(
        0x01020304,
        7,
        1234,
        0x0a0b0c0d,
        new Uint8Array(18).fill(0xab)
    )
    assert.equal(report.length, COMPOUND_LENGTH)
    assert.equal(report[0], 0x81)
    assert.equal(report[1], 200)
    assert.equal(readUInt16BE(report, 2), 18)
    assert.equal(readUInt32BE(report, 4), 0x01020304)
    assert.equal(readUInt32BE(report, 16), 0x0a0b0c0d)
    assert.equal(readUInt32BE(report, 20), 7)
    assert.equal(readUInt32BE(report, 24), 1234)
    assert.equal(report[SDES_OFFSET], 0x81)
    assert.equal(report[SDES_OFFSET + 1], 202)
    assert.equal(readUInt16BE(report, SDES_OFFSET + 2), 7)
    assert.equal(readUInt32BE(report, SDES_OFFSET + 4), 0x01020304)
    assert.equal(report[SDES_OFFSET + 8], 1)
    assert.equal(report[SDES_OFFSET + 9], 18)
    assert.match(
        new TextDecoder().decode(report.subarray(SDES_OFFSET + 10, SDES_OFFSET + 28)),
        /^[0-9a-f]{5}@pj[0-9a-f]{6}\.org$/
    )
    assert.deepEqual(report.subarray(SDES_OFFSET + 28), new Uint8Array(4))
})

test('sizes the sender report length word to include the report block and the trailer', () => {
    const report = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18))
    assert.equal(readUInt16BE(report, 2), 18)
    const senderReportBytes = (readUInt16BE(report, 2) + 1) * 4
    assert.equal(senderReportBytes, SENDER_REPORT_LENGTH)
    assert.equal(senderReportBytes, SDES_OFFSET)
    assert.equal(PACKET_TRAILER_OFFSET - REPORT_BLOCK_OFFSET, 32, 'the block carries its extension')
    assert.equal(senderReportBytes - PACKET_TRAILER_OFFSET, 16)
    const sdesBytes = (readUInt16BE(report, SDES_OFFSET + 2) + 1) * 4
    assert.equal(senderReportBytes + sdesBytes, report.length)
})

test('emits the same bytes as before the report block absorbed the extension', () => {
    const report = buildSenderReportWithSdes(
        0x01020304,
        25,
        2400,
        0x0a0b0c0d,
        imageCname(),
        PEER_RECEPTION,
        0x01020304
    )
    assert.deepEqual(withoutNtp(report), ONE_BLOCK_IMAGE)
})

test('reports a single source the same whether it arrives alone or in a list', () => {
    const cname = imageCname()
    const alone = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, PEER_RECEPTION, 7)
    const listed = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, [PEER_RECEPTION], 7)
    const empty = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, [], 7)
    assert.deepEqual(withoutNtp(listed), withoutNtp(alone))
    assert.equal(empty.length, COMPOUND_LENGTH, 'an empty list still reports one block')
    assert.equal(empty[0], 0x81)
    assert.deepEqual(
        empty.subarray(REPORT_BLOCK_OFFSET, BLOCK_EXTENSION_OFFSET),
        new Uint8Array(24)
    )
})

test('strides by a whole extended block for every source reported on', () => {
    const cname = imageCname()
    const one = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, [PEER_RECEPTION], 0x01020304)
    const two = buildSenderReportWithSdes(
        1,
        25,
        2400,
        24_000,
        cname,
        [PEER_RECEPTION, OTHER_RECEPTION],
        0x01020304
    )
    assert.equal(two.length - one.length, REPORT_BLOCK_LENGTH, 'a block is 32 bytes, not 24')
    assert.equal(two[0] & 0x1f, 2)
    assert.equal(readUInt16BE(two, 2), 26, 'the length word grows by eight words per block')
    assert.equal((readUInt16BE(two, 2) + 1) * 4, SENDER_REPORT_LENGTH + REPORT_BLOCK_LENGTH)

    const second = REPORT_BLOCK_OFFSET + REPORT_BLOCK_LENGTH
    assert.equal(readUInt32BE(two, REPORT_BLOCK_OFFSET), PEER_RECEPTION.ssrc)
    assert.equal(readUInt32BE(two, second), OTHER_RECEPTION.ssrc)
    assert.deepEqual(
        two.subarray(REPORT_BLOCK_OFFSET, second),
        one.subarray(REPORT_BLOCK_OFFSET, REPORT_BLOCK_OFFSET + REPORT_BLOCK_LENGTH),
        'the first block is untouched by the second'
    )
})

test('repeats the block extension per block and the packet trailer once', () => {
    const report = buildSenderReportWithSdes(
        1,
        25,
        2400,
        24_000,
        imageCname(),
        [PEER_RECEPTION, OTHER_RECEPTION],
        0x01020304
    )
    const extension = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x00, 0x02, 0x48, 0x00])
    for (let index = 0; index < 2; index++) {
        const at = BLOCK_EXTENSION_OFFSET + index * REPORT_BLOCK_LENGTH
        assert.deepEqual(report.subarray(at, at + 8), extension, `block ${index} carries it`)
    }
    const trailer = REPORT_BLOCK_OFFSET + 2 * REPORT_BLOCK_LENGTH
    assert.deepEqual(
        report.subarray(trailer, trailer + 16),
        new Uint8Array([
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x50, 0x00
        ])
    )
    assert.equal(report[trailer + 16], 0x81, 'the SDES chunk follows the one trailer')
    assert.equal(report[trailer + 17], 202)
})

test('reports on no more sources than the reception report count can carry', () => {
    const sources = Array.from({ length: 40 }, (_, index) => ({ ssrc: index + 1 }))
    const report = buildSenderReportWithSdes(1, 25, 2400, 24_000, new Uint8Array(18), sources)
    assert.equal(report[0] & 0x1f, 31)
    assert.equal(report.length, REPORT_BLOCK_OFFSET + 31 * REPORT_BLOCK_LENGTH + 16 + 32)
    assert.equal((readUInt16BE(report, 2) + 1) * 4, report.length - 32)
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET + 30 * REPORT_BLOCK_LENGTH), 31)
})

/**
 * 0x91 is byte 0 that the official client sends on the video sender report:
 * in a capture of 105 SRTCP packets, 76 were sender reports in this form.
 * The bit is the same one from the video PLI, and the count field left under
 * it still announces one report block, which is what a one-to-one call
 * reports.
 */
test('a video sender report carries the WhatsApp profile bit over its block count', () => {
    const report = buildSenderReportWithSdes(
        1,
        25,
        2400,
        24_000,
        imageCname(),
        PEER_RECEPTION,
        7,
        true,
        true
    )

    assert.equal(report[0], 0x91)
    assert.equal(report[0] & 0xc0, 0x80, 'still RTCP version 2 with no padding')
    assert.equal(report[0] & VIDEO_PROFILE_BIT, VIDEO_PROFILE_BIT, 'the profile bit is raised')
    assert.equal(report[0] & VIDEO_REPORT_COUNT_MASK, 1, 'and one block is counted under it')
    assert.equal(report[1], 200)
})

/**
 * The bit was never observed on a sender report attributable to audio, so
 * that path stays on the canonical byte. That is why the distinction is a
 * parameter: unifying the two paths would either invent an observation on
 * one side or erase the one on the other.
 */
test('an audio sender report stays on the canonical byte, with no profile bit', () => {
    const report = buildSenderReportWithSdes(1, 25, 2400, 24_000, imageCname(), PEER_RECEPTION, 7)

    assert.equal(report[0], 0x81)
    assert.equal(report[0] & VIDEO_PROFILE_BIT, 0, 'no profile bit on the unmarked path')
    assert.equal(report[0] & REPORT_COUNT_MASK, 1, 'the same one block the video report counts')
})

test('the profile bit moves byte 0 of the sender report and nothing else', () => {
    const cname = imageCname()
    const audio = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, PEER_RECEPTION, 7)
    const video = buildSenderReportWithSdes(
        1,
        25,
        2400,
        24_000,
        cname,
        PEER_RECEPTION,
        7,
        true,
        true
    )

    assert.equal(video.length, audio.length)
    assert.deepEqual(
        withoutNtp(video).subarray(1),
        withoutNtp(audio).subarray(1),
        'the bit is one bit of one byte, not a second shape of the packet'
    )
    assert.equal(video[SDES_OFFSET], 0x81, 'the SDES chunk counts chunks, not video profiles')
    assert.equal(video[SDES_OFFSET + 1], 202)
})

/**
 * The profile and the count share byte 0, so with the bit on the count only
 * has four bits. Above 15 blocks the two readings collide - 0x80 | 31 is the
 * same 0x9f as a video report with 15 blocks - and that is why the video
 * path caps at 15 instead of letting the count invade the profile. The case
 * does not come up in the session: each stream reports one source.
 */
test('a video sender report reports on no more sources than four bits can count', () => {
    const sources = Array.from({ length: 40 }, (_, index) => ({ ssrc: index + 1 }))
    const cname = new Uint8Array(18)
    const video = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, sources, 7, true, true)
    const audio = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, sources, 7)

    assert.equal(video[0] & VIDEO_PROFILE_BIT, VIDEO_PROFILE_BIT, 'the bit survives the clamp')
    assert.equal(video[0] & VIDEO_REPORT_COUNT_MASK, 15)
    assert.equal(audio[0] & REPORT_COUNT_MASK, 31, 'the unmarked path still counts to 31')
    assert.equal(video.length, REPORT_BLOCK_OFFSET + 15 * REPORT_BLOCK_LENGTH + 16 + 32)
    assert.equal(
        (readUInt16BE(video, 2) + 1) * 4,
        video.length - 32,
        'the length word and the counted blocks describe the same bytes'
    )
    assert.equal(readUInt32BE(video, REPORT_BLOCK_OFFSET + 14 * REPORT_BLOCK_LENGTH), 15)
})

test('carries one report block with the reception statistics of the peer', () => {
    const report = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18), PEER_RECEPTION)
    assert.equal(report[0] & 0x1f, 1)
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET), PEER_RECEPTION.ssrc)
    assert.equal(report[REPORT_BLOCK_OFFSET + 4], PEER_RECEPTION.fractionLost)
    assert.equal(
        (report[REPORT_BLOCK_OFFSET + 5] << 16) |
            (report[REPORT_BLOCK_OFFSET + 6] << 8) |
            report[REPORT_BLOCK_OFFSET + 7],
        PEER_RECEPTION.packetsLost
    )
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET + 8), 0x0003_beef)
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET + 12), PEER_RECEPTION.jitter)
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET + 16), PEER_RECEPTION.lastSenderReport)
    assert.equal(
        readUInt32BE(report, REPORT_BLOCK_OFFSET + 20),
        PEER_RECEPTION.delaySinceLastSenderReport
    )
})

test('degrades the extended sequence number to 16 bits without a cycle count', () => {
    const report = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18), {
        ssrc: 9,
        highestSequence: 0xfffe
    })
    assert.equal(readUInt32BE(report, REPORT_BLOCK_OFFSET + 8), 0x0000_fffe)
    const wrapped = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18), {
        ssrc: 9,
        highestSequence: 0x1_0002,
        cycles: 1
    })
    assert.equal(readUInt32BE(wrapped, REPORT_BLOCK_OFFSET + 8), 0x0001_0002)
})

test('encodes cumulative loss as a signed 24-bit field', () => {
    const negative = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18), {
        ssrc: 9,
        packetsLost: -3
    })
    assert.deepEqual(
        negative.subarray(REPORT_BLOCK_OFFSET + 5, REPORT_BLOCK_OFFSET + 8),
        new Uint8Array([0xff, 0xff, 0xfd])
    )
    const overflowed = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18), {
        ssrc: 9,
        packetsLost: 0x7fffff + 10
    })
    assert.deepEqual(
        overflowed.subarray(REPORT_BLOCK_OFFSET + 5, REPORT_BLOCK_OFFSET + 8),
        new Uint8Array([0x7f, 0xff, 0xff])
    )
    const underflowed = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18), {
        ssrc: 9,
        packetsLost: -0x800000 - 10
    })
    assert.deepEqual(
        underflowed.subarray(REPORT_BLOCK_OFFSET + 5, REPORT_BLOCK_OFFSET + 8),
        new Uint8Array([0x80, 0x00, 0x00])
    )
})

test('reports an all-zero block when the caller has measured nothing yet', () => {
    const report = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18))
    assert.equal(report[0], 0x81)
    assert.deepEqual(
        report.subarray(REPORT_BLOCK_OFFSET, BLOCK_EXTENSION_OFFSET),
        new Uint8Array(24)
    )
    const identified = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18), { ssrc: 0x2233 })
    assert.equal(readUInt32BE(identified, REPORT_BLOCK_OFFSET), 0x2233)
    assert.deepEqual(
        identified.subarray(REPORT_BLOCK_OFFSET + 4, BLOCK_EXTENSION_OFFSET),
        new Uint8Array(20)
    )
})

test('closes the report block with two words and the packet with four', () => {
    const report = buildSenderReportWithSdes(
        1,
        10,
        0,
        0,
        new Uint8Array(18),
        { ssrc: 0 },
        0x01020304
    )
    assert.equal(readUInt32BE(report, BLOCK_EXTENSION_OFFSET), 0x01020304)
    assert.equal(readUInt32BE(report, BLOCK_EXTENSION_OFFSET + 4), 0x24800)
    assert.deepEqual(
        report.subarray(PACKET_TRAILER_OFFSET, SDES_OFFSET),
        new Uint8Array([
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x50, 0x00
        ])
    )
    assert.equal(readUInt32BE(report, PACKET_TRAILER_OFFSET), 0)
    assert.equal(readUInt32BE(report, PACKET_TRAILER_OFFSET + 4), 0)
    assert.equal(readUInt32BE(report, PACKET_TRAILER_OFFSET + 8), 0)
    assert.equal(readUInt32BE(report, PACKET_TRAILER_OFFSET + 12), 0x5000)
})

test('keeps the packet trailer intact behind a populated report block', () => {
    const cname = new Uint8Array(18)
    const bare = buildSenderReportWithSdes(1, 10, 0, 0, cname, { ssrc: 0 }, 0x01020304)
    const reporting = buildSenderReportWithSdes(1, 10, 0, 0, cname, PEER_RECEPTION, 0x01020304)
    assert.deepEqual(
        reporting.subarray(PACKET_TRAILER_OFFSET, SDES_OFFSET),
        bare.subarray(PACKET_TRAILER_OFFSET, SDES_OFFSET)
    )
})

test('a group sender report stops at the last block, where a one-to-one report trails', () => {
    const cname = imageCname()
    const oneToOne = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, PEER_RECEPTION, 7)
    const group = buildSenderReportWithSdes(1, 25, 2400, 24_000, cname, PEER_RECEPTION, 7, false)

    assert.equal((readUInt16BE(oneToOne, 2) + 1) * 4, SENDER_REPORT_LENGTH)
    assert.equal(
        (readUInt16BE(group, 2) + 1) * 4,
        GROUP_SENDER_REPORT_LENGTH,
        '28 of header and sender info plus one 32-byte block, and nothing behind it'
    )
    assert.equal(oneToOne.length - group.length, 16, 'the trailer is the whole difference')
    assert.equal(group[0] & 0x1f, 1, 'the block count does not depend on the trailer')
    assert.deepEqual(
        group.subarray(REPORT_BLOCK_OFFSET, PACKET_TRAILER_OFFSET),
        oneToOne.subarray(REPORT_BLOCK_OFFSET, PACKET_TRAILER_OFFSET),
        'the blocks are the same bytes on both paths'
    )
    assert.deepEqual(
        group.subarray(GROUP_SENDER_REPORT_LENGTH),
        oneToOne.subarray(SDES_OFFSET),
        'the SDES chunk follows the blocks directly'
    )
})

test('a group sender report grows by a whole block per source, still with no trailer', () => {
    const report = buildSenderReportWithSdes(
        1,
        25,
        2400,
        24_000,
        imageCname(),
        [PEER_RECEPTION, OTHER_RECEPTION],
        7,
        false
    )
    const sdesOffset = REPORT_BLOCK_OFFSET + 2 * REPORT_BLOCK_LENGTH

    assert.equal(report[0] & 0x1f, 2)
    assert.equal((readUInt16BE(report, 2) + 1) * 4, sdesOffset)
    assert.equal(report.length, sdesOffset + 32)
    assert.equal(report[sdesOffset], 0x81)
    assert.equal(report[sdesOffset + 1], 202)
})

test('keeps the trailer live metric inside the observed band', () => {
    const report = buildSenderReportWithSdes(1, 0, 0, 0, new Uint8Array(18))
    const liveMetric = readUInt32BE(report, PACKET_TRAILER_OFFSET + 12)
    assert.ok(liveMetric >= 0x4e00 && liveMetric <= 0x5400)
})

test('advances the block counter across successive sender reports', () => {
    const cname = new Uint8Array(18)
    const first = buildSenderReportWithSdes(1, 25, 2400, 24000, cname)
    const second = buildSenderReportWithSdes(1, 50, 4800, 48000, cname)
    const third = buildSenderReportWithSdes(1, 75, 7200, 72000, cname)
    const counters = [first, second, third].map((report) =>
        readUInt32BE(report, BLOCK_EXTENSION_OFFSET)
    )
    assert.ok(counters[1] > counters[0])
    assert.ok(counters[2] > counters[1])
    assert.equal(counters[1] - counters[0], counters[2] - counters[1])
})

test('lets the caller drive the block counter from session state', () => {
    const cname = new Uint8Array(18)
    const report = buildSenderReportWithSdes(1, 25, 2400, 24000, cname, PEER_RECEPTION, 0xfffffff0)
    assert.equal(readUInt32BE(report, BLOCK_EXTENSION_OFFSET), 0xfffffff0)
    const wrapped = buildSenderReportWithSdes(
        1,
        25,
        2400,
        24000,
        cname,
        PEER_RECEPTION,
        0x1_0000_0005
    )
    assert.equal(readUInt32BE(wrapped, BLOCK_EXTENSION_OFFSET), 5)
})

test('keeps the SDES chunk byte-identical whatever the report block carries', () => {
    const cname = new Uint8Array(18).fill(0x5c)
    const bare = buildSenderReportWithSdes(0x01020304, 7, 1234, 0x0a0b0c0d, cname)
    const reporting = buildSenderReportWithSdes(
        0x01020304,
        7,
        1234,
        0x0a0b0c0d,
        cname,
        PEER_RECEPTION
    )
    assert.deepEqual(reporting.subarray(SDES_OFFSET), bare.subarray(SDES_OFFSET))
    assert.equal(bare.length - SDES_OFFSET, 32)
})

test('builds a picture loss indication with the RFC 4585 format when the profile bit is off', () => {
    const packet = buildPictureLossIndication(0x11223344, 0x55667788)
    assert.equal(packet.length, 12)
    assert.equal(packet[0], 0x81)
    assert.equal(packet[1], 206)
    assert.equal(readUInt16BE(packet, 2), 2)
    assert.equal(readUInt32BE(packet, 4), 0x11223344)
    assert.equal(readUInt32BE(packet, 8), 0x55667788)
})

/**
 * 0x91 is WhatsApp convention, not an RFC 4585 FMT: the 5-bit field becomes
 * 17, which the RFC does not define. It is pinned here because the byte read
 * against the RFC looks like an error to anyone who has not seen the two
 * sources that back it - the official client's capture, with 76 packets at
 * 0x91 against 15 at 0x81, and this repository's earlier implementation. The
 * parity audit removed it as an error, and the removal lines up with the
 * caller reporting zero PLIs received.
 */
test('builds a video picture loss indication with the WhatsApp profile bit, not an RFC FMT', () => {
    const packet = buildPictureLossIndication(0x11223344, 0x55667788, true)
    assert.equal(packet.length, 12)
    assert.equal(packet[0], 0x91)
    assert.equal(packet[1], 206)
    assert.equal(readUInt16BE(packet, 2), 2)
    assert.equal(readUInt32BE(packet, 4), 0x11223344)
    assert.equal(readUInt32BE(packet, 8), 0x55667788)
})

test('builds a full intra request with the target ssrc in the FCI', () => {
    const packet = buildFullIntraRequest(0x11223344, 0x55667788, 9)
    assert.equal(packet.length, 20)
    assert.equal(packet[0], 0x84)
    assert.equal(packet[1], 206)
    assert.equal(readUInt16BE(packet, 2), 4)
    assert.equal(readUInt32BE(packet, 4), 0x11223344)
    assert.equal(readUInt32BE(packet, 8), 0)
    assert.equal(readUInt32BE(packet, 12), 0x55667788)
    assert.equal(packet[16], 9)
})

/** Where the count-plus-bandwidth word and the listed SSRC sit in a REMB. */
const REMB_BAND_OFFSET = 16
const REMB_SSRC_OFFSET = 20
/** Bytes of a REMB over one source: 12-byte PSFB header and 12-byte FCI. */
const REMB_LENGTH = 24
/** Largest mantissa of the field, where it saturates and the exponent has to climb. */
const REMB_MAX_MANTISSA = 0x3ffff

/** The exponent-mantissa pair as the packet carries it. */
function rembBand(packet: Uint8Array): { readonly exponent: number; readonly mantissa: number } {
    const band = readUInt32BE(packet, REMB_BAND_OFFSET) & 0xffffff
    return { exponent: band >>> 18, mantissa: band & REMB_MAX_MANTISSA }
}

/** The bandwidth the pair announces, which is `mantissa << exponent`. */
function rembBitrate(packet: Uint8Array): number {
    const band = rembBand(packet)
    return band.mantissa * 2 ** band.exponent
}

test('builds a receiver estimated max bitrate in the standard PSFB format', () => {
    const packet = buildReceiverEstimatedMaxBitrate(0x11223344, 0x55667788, 262_143)

    assert.equal(packet.length, REMB_LENGTH)
    assert.equal(packet[0], 0x8f, 'plain FMT 15, with no profile bit over it')
    assert.equal(packet[0] & 0x1f, 15, 'the 5-bit field reads 15, which 0x9f would turn into 31')
    assert.equal(
        packet[0] & VIDEO_PROFILE_BIT,
        0,
        'the official client sends its REMB without the bit its sender reports carry'
    )
    assert.equal(packet[1], 206)
    assert.equal(readUInt16BE(packet, 2), 5)
    assert.equal(readUInt32BE(packet, 4), 0x11223344)
    assert.equal(readUInt32BE(packet, 8), 0, 'the header media ssrc stays zero, as in the FIR')
    assert.deepEqual(
        packet.subarray(12, 16),
        new Uint8Array([0x52, 0x45, 0x4d, 0x42]),
        'the FCI opens with REMB in ASCII'
    )
    assert.equal(packet[REMB_BAND_OFFSET], 1, 'one ssrc is named')
    assert.equal(readUInt32BE(packet, REMB_SSRC_OFFSET), 0x55667788)
})

test('encodes the bitrate as a 6-bit exponent over an 18-bit mantissa', () => {
    const cases: readonly (readonly [number, number, number])[] = [
        [0, 0, 0],
        [64_000, 0, 64_000],
        [262_143, 0, 262_143],
        [300_000, 1, 150_000],
        [1_500_000, 3, 187_500],
        [2_000_000, 3, 250_000]
    ]
    for (const [bitsPerSecond, exponent, mantissa] of cases) {
        const packet = buildReceiverEstimatedMaxBitrate(1, 2, bitsPerSecond)
        assert.deepEqual(rembBand(packet), { exponent, mantissa }, `${bitsPerSecond} bps`)
        assert.equal(rembBitrate(packet), bitsPerSecond, 'and decodes back to the same bitrate')
    }
})

/**
 * The point where the mantissa saturates and the exponent increments is
 * where this encoding usually breaks: 262143 still fits in 18 bits, 262144
 * does not fit and has to become 131072 with exponent 1.
 */
test('carries the mantissa into the exponent when 18 bits stop fitting', () => {
    const fits = buildReceiverEstimatedMaxBitrate(1, 2, REMB_MAX_MANTISSA)
    const overflows = buildReceiverEstimatedMaxBitrate(1, 2, REMB_MAX_MANTISSA + 1)

    assert.deepEqual(rembBand(fits), { exponent: 0, mantissa: REMB_MAX_MANTISSA })
    assert.deepEqual(rembBand(overflows), { exponent: 1, mantissa: (REMB_MAX_MANTISSA + 1) / 2 })
    assert.equal(rembBitrate(fits), REMB_MAX_MANTISSA)
    assert.equal(rembBitrate(overflows), REMB_MAX_MANTISSA + 1, 'the step itself loses nothing')
})

test('never encodes a bitrate above the one it was asked for', () => {
    for (const bitsPerSecond of [262_145, 524_289, 999_999, 1_048_577, 33_554_433]) {
        const encoded = rembBitrate(buildReceiverEstimatedMaxBitrate(1, 2, bitsPerSecond))
        assert.ok(encoded <= bitsPerSecond, `${bitsPerSecond} encoded up to ${encoded}`)
        assert.ok(encoded > bitsPerSecond / 2, `${bitsPerSecond} lost more than one step`)
    }
})

test('saturates the exponent and mantissa instead of wrapping them', () => {
    const packet = buildReceiverEstimatedMaxBitrate(1, 2, 1e30)
    assert.deepEqual(rembBand(packet), { exponent: 0x3f, mantissa: REMB_MAX_MANTISSA })
    assert.equal(readUInt32BE(packet, REMB_BAND_OFFSET), 0x01ffffff)
    assert.equal(packet[REMB_BAND_OFFSET], 1, 'saturating must not spill into the ssrc count')
})

test('a compound packet that opens with a sender report names the source it describes', () => {
    const report = buildSenderReportWithSdes(0xdeadbeef, 10, 100, 960)
    const remb = buildReceiverEstimatedMaxBitrate(0x11111111, 0x22222222, 30_000)

    assert.equal(senderReportSourceSsrc(report), 0xdeadbeef)
    assert.equal(senderReportSourceSsrc(remb), null)
    assert.equal(senderReportSourceSsrc(report.subarray(0, 27)), null)
})

test('a REMB lists every source a group estimate covers, and one source stays the 1:1 shape', () => {
    const many = buildReceiverEstimatedMaxBitrate(0x11111111, [0x0a0a0a03, 0x0b0b0b03], 300_000)
    const one = buildReceiverEstimatedMaxBitrate(0x11111111, 0x0a0a0a03, 300_000)

    assert.equal(many.length, one.length + 4)
    assert.equal(readUInt16BE(many, 2), many.length / 4 - 1)
    assert.equal(many[16], 2)
    assert.deepEqual([readUInt32BE(many, 20), readUInt32BE(many, 24)], [0x0a0a0a03, 0x0b0b0b03])
    assert.deepEqual(
        buildReceiverEstimatedMaxBitrate(0x11111111, [0x0a0a0a03], 300_000),
        one,
        'a list of one is the single-source packet'
    )
})

/** The compound may hold enough bytes while the sender report itself declares too few. */
test('a sender report whose own length is short or overruns the compound names no source', () => {
    const short = new Uint8Array(40)
    short.set([0x80, 200, 0x00, 0x01, 0xde, 0xad, 0xbe, 0xef])
    short.set([0x81, 202, 0x00, 0x07], 8)
    const overrun = buildSenderReportWithSdes(0xdeadbeef, 10, 100, 960).slice(0, 40)
    overrun[3] = 0x20

    assert.equal(senderReportSourceSsrc(short), null)
    assert.equal(senderReportSourceSsrc(overrun), null)
})
