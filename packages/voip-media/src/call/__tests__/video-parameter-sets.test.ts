import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import { RtpPacket, RtpSession } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const SELF_VIDEO_SSRC = 0x22222222
const H264_PAYLOAD_TYPE = 97
const FRAME_INTERVAL_US = 66_667

const SPS = [0x67, 0x4d, 0x40, 0x1f, 0xda, 0x02, 0x80, 0xf6, 0xc0, 0x44]
const PPS = [0x68, 0xee, 0x3c, 0x80]
/** An IDR slice large enough to need FU-A at the plane's 800-byte budget. */
const IDR = [0x65, ...Array.from({ length: 1900 }, (_, i) => (i % 250) + 1)]
const DELTA = [0x41, 0x9a, 0x02, 0x03]

function annexB(...nals: number[][]): Uint8Array {
    const bytes: number[] = []
    for (const nal of nals) bytes.push(0, 0, 0, 1, ...nal)
    return new Uint8Array(bytes)
}

/** A sending video plane with pass-through SRTP whose relay keeps what it would transmit. */
async function createPlane(): Promise<{ plane: WaCallMediaPlane; sent: RtpPacket[] }> {
    const sent: RtpPacket[] = []
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })
    await plane.apply({ mediaType: 'video' })
    const internals = plane as unknown as Record<string, unknown>
    internals.sctpRelay = {
        setMediaFlowing: () => {},
        sendMedia: (data: ArrayBuffer) => {
            const bytes = new Uint8Array(data)
            if ((bytes[1] & 0x7f) === H264_PAYLOAD_TYPE) sent.push(RtpPacket.decode(bytes))
        },
        hasConnection: () => true,
        cleanup: () => {},
        setSubscriptionSsrc: () => {},
        resendSubscriptions: () => {}
    }
    internals.srtpSession = {
        protect: (packet: RtpPacket) => packet.encode(),
        unprotect: (data: Uint8Array) => RtpPacket.decode(data)
    }
    internals.srtcpContext = { protect: (rtcp: Uint8Array) => rtcp }
    internals.videoRtpSession = new RtpSession(SELF_VIDEO_SSRC, H264_PAYLOAD_TYPE)
    await plane.apply({ accepted: true })
    return { plane, sent }
}

test('a key frame over one packet leaves as FU-A typed SPS, one timestamp, marker on the last', async () => {
    const { plane, sent } = await createPlane()
    const count = plane.sendVideoFrame(annexB(SPS, PPS, IDR), 0)
    assert.equal(count, sent.length)
    assert.ok(sent.length > 1)
    assert.deepEqual(
        sent.map((p) => [p.payload[0], p.payload[1]]),
        sent.map((_, i) => [0x7c, 0x07 | (i === 0 ? 0x80 : 0) | (i === sent.length - 1 ? 0x40 : 0)])
    )
    assert.equal(new Set(sent.map((p) => p.header.timestamp)).size, 1)
    assert.deepEqual(
        sent.map((p) => p.header.marker),
        sent.map((_, i) => i === sent.length - 1)
    )
    // The packet that opens the frame carries the frame number; every packet carries the key flag.
    assert.equal(sent[0].header.extensionData[0], 0x32)
    assert.ok(sent.every((p) => p.header.extensionData[1] === 0x08))
    assert.ok(sent.every((p) => p.payload.length <= 800))
})

test('a key frame that fits one packet leaves as one marked STAP-A of SPS, PPS and IDR', async () => {
    const { plane, sent } = await createPlane()
    const idr = IDR.slice(0, 100)
    assert.equal(plane.sendVideoFrame(annexB(SPS, PPS, idr), 0), 1)
    assert.deepEqual(
        sent[0].payload,
        new Uint8Array([0x78, 0, SPS.length, ...SPS, 0, PPS.length, ...PPS, 0, idr.length, ...idr])
    )
    assert.equal(sent[0].header.marker, true)
    assert.equal(sent[0].header.extensionData[0], 0x32)
    assert.equal(sent[0].header.extensionData[1], 0x08)
})

test('sequence numbers stay consecutive across key and delta frames', async () => {
    const { plane, sent } = await createPlane()
    plane.sendVideoFrame(annexB(SPS, PPS, IDR), 0)
    const afterKey = sent.length
    plane.sendVideoFrame(annexB(DELTA), FRAME_INTERVAL_US)
    plane.sendVideoFrame(annexB(SPS, PPS, IDR), 2 * FRAME_INTERVAL_US)
    for (let i = 1; i < sent.length; i++) {
        assert.equal(
            sent[i].header.sequenceNumber,
            (sent[i - 1].header.sequenceNumber + 1) & 0xffff
        )
    }
    const delta = sent[afterKey]
    assert.deepEqual(delta.payload, new Uint8Array(DELTA), 'a delta frame is unchanged')
    assert.equal(delta.header.marker, true)
    assert.notEqual(delta.header.timestamp, sent[0].header.timestamp)
})
