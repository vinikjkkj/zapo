import assert from 'node:assert/strict'
import { test } from 'node:test'

import { buildWhatsAppPing, classifyPacket, isStunPacket } from '../stun.js'
import { isWarpFramedPacket, readWarpFrame, warpFrameHeaderLength } from '../warp-frame.js'

/** RTP v2 with the extension bit, PT 121, then seq, timestamp, SSRC and an empty `0xdebe` profile. */
function rtpHeader(sequenceNumber: number, timestamp: number): Uint8Array {
    return Uint8Array.of(
        0x90,
        0x79,
        (sequenceNumber >> 8) & 0xff,
        sequenceNumber & 0xff,
        (timestamp >>> 24) & 0xff,
        (timestamp >>> 16) & 0xff,
        (timestamp >>> 8) & 0xff,
        timestamp & 0xff,
        0x19,
        0x1c,
        0x7f,
        0x57,
        0xde,
        0xbe,
        0x00,
        0x00
    )
}

/** The 8-byte header: `09 02 <ctr16> 01 00 <ctr16>`. */
const FRAME_PREFIX_8 = Uint8Array.of(0x09, 0x02, 0x01, 0x93, 0x01, 0x00, 0x01, 0x93)

/** The 18-byte header; its attribute bytes are filler the reader must never look at. */
const FRAME_PREFIX_18 = Uint8Array.of(0x09, 0x07, 0x02, 0x41, ...new Uint8Array(14).fill(0xaa))

const STUN_MAGIC_COOKIE = Uint8Array.of(0x21, 0x12, 0xa4, 0x42)

const PAYLOAD = Uint8Array.from({ length: 106 }, (_, i) => (i * 7 + 3) & 0xff)

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
    let offset = 0
    for (const part of parts) {
        out.set(part, offset)
        offset += part.length
    }
    return out
}

function mediaPacket(sequenceNumber: number, timestamp: number): Uint8Array {
    return concat(rtpHeader(sequenceNumber, timestamp), PAYLOAD)
}

test('the length byte of each header size gives the offset of the rtp behind it', () => {
    assert.equal(warpFrameHeaderLength(FRAME_PREFIX_8), 8)
    assert.equal(warpFrameHeaderLength(FRAME_PREFIX_18), 18)
})

test('the top bit of the length byte is not length', () => {
    assert.equal(warpFrameHeaderLength(Uint8Array.of(0x09, 0x82, 0, 0)), 8)
})

test('a framed packet hands back the rtp that was inside it, as a view', () => {
    const rtp = mediaPacket(0x0089, 0x00051cc0)

    for (const prefix of [FRAME_PREFIX_8, FRAME_PREFIX_18]) {
        const framed = concat(prefix, rtp)
        const read = readWarpFrame(framed)
        assert.equal(read.kind, 'framed')
        if (read.kind !== 'framed') return
        assert.equal(read.headerLength, prefix.length)
        assert.deepEqual(read.rtp, rtp)
        assert.equal(read.rtp.buffer, framed.buffer, 'no copy of the datagram')
    }
})

test('an unframed rtp packet is not a frame', () => {
    const rtp = mediaPacket(0x008b, 0x00052440)
    assert.equal(isWarpFramedPacket(rtp), false)
    assert.deepEqual(readWarpFrame(rtp), { kind: 'not_framed' })
})

test('a datagram too short for the base header is not a frame', () => {
    assert.equal(isWarpFramedPacket(Uint8Array.of(0x09, 0x02, 0x01)), false)
    assert.equal(readWarpFrame(Uint8Array.of(0x09, 0x02, 0x01)).kind, 'not_framed')
})

test('a length that runs past the end of the datagram is reported, not trusted', () => {
    const overrun = concat(Uint8Array.of(0x09, 0x40, 0x01, 0x93), PAYLOAD.subarray(0, 20))
    assert.deepEqual(readWarpFrame(overrun), { kind: 'header_overruns', headerLength: 132 })
})

test('a frame with no rtp behind it is told apart from one carrying media', () => {
    const control = Uint8Array.of(0x09, 0x02, 0x01, 0x93, 0x28, 0x00, 0x01, 0x93)
    assert.deepEqual(readWarpFrame(control), { kind: 'no_rtp_inside', headerLength: 8 })

    const shortRtp = concat(FRAME_PREFIX_8, rtpHeader(1, 960).subarray(0, 11))
    assert.equal(readWarpFrame(shortRtp).kind, 'no_rtp_inside')
})

test('a frame is never stun, even with the magic cookie inside its attributes', () => {
    const rtp = mediaPacket(0x0089, 0x000201c0)
    const framed = concat(FRAME_PREFIX_8, rtp)
    const cookieInAttributes = concat(
        Uint8Array.of(0x09, 0x07, 0x02, 0x41),
        STUN_MAGIC_COOKIE,
        new Uint8Array(10),
        rtp
    )

    assert.equal(isStunPacket(framed), false)
    assert.equal(readWarpFrame(cookieInAttributes).kind, 'framed')
    assert.equal(isStunPacket(cookieInAttributes), false)
})

test('the stun control channel is not read as a frame', () => {
    const ping = buildWhatsAppPing()
    assert.equal(isWarpFramedPacket(ping), false)
    assert.equal(isStunPacket(ping), true)
})

test('a frame is named as one in the packet traces', () => {
    const framed = concat(FRAME_PREFIX_18, mediaPacket(1, 960))
    assert.equal(classifyPacket(framed), `WARP frame hdr=18 (${framed.length}B)`)
    assert.match(classifyPacket(buildWhatsAppPing()), /^STUN wa-ping/)
})
