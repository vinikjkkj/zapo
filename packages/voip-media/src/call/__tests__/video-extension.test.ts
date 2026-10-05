import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import {
    WA_FAST_REMB_BITRATE_ENCODING,
    WA_FAST_REMB_ELEMENT_LENGTH,
    WA_FAST_REMB_EXTENSION_ID
} from '../../media/fast-remb.js'
import { SenderReportSchedule } from '../../media/rtcp.js'
import { RtpHeader, RtpPacket, RtpSession, WA_RTP_EXTENSION_PROFILE } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { WaCallMediaSettings } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const SELF_VIDEO_SSRC = 0x22222222
const PEER_VIDEO_SSRC = 0x33333333

const H264_PAYLOAD_TYPE = 97
/** Largest video payload per packet, the cut the plane uses when slicing. */
const VIDEO_MAX_PAYLOAD = 800
/** Microseconds between two frames at 30 per second. */
const VIDEO_FRAME_INTERVAL_US = 33_333

/**
 * The video rate arriving under the defect this extension exists to remove,
 * in bits per second. The peer, in the same capture, announces about 150,000
 * while sending this: the field is estimated bandwidth, an order of magnitude
 * above the measured stream, and what comes out of here has to have the same
 * shape.
 */
const COLLAPSED_INBOUND_BITRATE = 29_500

/**
 * The extension of the first packet of a frame, as it was before the
 * bandwidth estimate existed: frame-opening, frame info, the frame number,
 * and the three elements that were already there, closing at 16 bytes with
 * padding.
 */
const EXTENSION_WITHOUT_ESTIMATE = new Uint8Array([
    0x32, 0x08, 0x00, 0x00, 0x51, 0x00, 0x00, 0x61, 0x00, 0x00, 0x91, 0x00, 0x00, 0x00, 0x00, 0x00
])

/** Bytes of the frame-opening extension before the padding and the estimate. */
const EXTENSION_BASE_LENGTH = 13

/** The same extension on a packet that does not open a frame, which never carries the estimate. */
const CONTINUATION_EXTENSION = new Uint8Array([
    0x30, 0x08, 0x51, 0x00, 0x00, 0x61, 0x00, 0x00, 0x91, 0x00, 0x01, 0x00
])

interface PlaneInternals {
    videoStreamOpen: boolean
    videoRtpSession: RtpSession
    srtpSession: {
        protect: (packet: RtpPacket) => Uint8Array
        unprotect: (data: Uint8Array) => RtpPacket
    }
    srtcpContext: { protect: (rtcp: Uint8Array, senderSsrc: number) => Uint8Array }
    sctpRelay: {
        broadcast: (data: ArrayBuffer) => void
        hasConnection: () => boolean
        cleanup: () => void
        setSubscriptionSsrc: (ssrc: number) => void
        resendSubscriptions: () => void
    }
    receiverEstimateSchedule: SenderReportSchedule
    buildVideoExtension: (
        keyFrame: boolean,
        firstPacket: boolean,
        transportSequence: number,
        receiverEstimate: number
    ) => Uint8Array
    onRelayData: (data: Uint8Array) => void
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly sent: Uint8Array[]
    readonly internals: PlaneInternals
    videoFrames: number
}

/** An extension element in the one-byte form of RFC 8285. */
interface ExtensionElement {
    readonly id: number
    readonly data: Uint8Array
}

/**
 * A video plane whose relay collects what would be transmitted and whose
 * SRTP layers are pass-through, so the packets can be read as they were
 * built. The estimate schedule stays at zero milliseconds so every packet
 * past the one that opens the interval closes one, which makes the ceiling's
 * climb observable without waiting on a real clock.
 */
async function createPlane(
    settings?: WaCallMediaSettings,
    { accepted = true }: { readonly accepted?: boolean } = {}
): Promise<Harness> {
    const sent: Uint8Array[] = []
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })
    await plane.apply({ mediaType: 'video' })

    if (settings !== undefined) {
        await plane.apply({ settings })
    }

    const internals = plane as unknown as PlaneInternals
    internals.sctpRelay = {
        broadcast: (data) => {
            sent.push(new Uint8Array(data))
        },
        hasConnection: () => true,
        cleanup: () => {},
        setSubscriptionSsrc: () => {},
        resendSubscriptions: () => {}
    }
    internals.srtpSession = {
        protect: (packet) => packet.encode(),
        unprotect: (data) => RtpPacket.decode(data)
    }
    internals.srtcpContext = { protect: (rtcp) => rtcp }
    internals.videoRtpSession = new RtpSession(SELF_VIDEO_SSRC, H264_PAYLOAD_TYPE)
    internals.receiverEstimateSchedule = SenderReportSchedule.onWallClock(0)
    // Video goes out only once media flows: the call accepted, with a leg up.
    if (accepted) {
        await plane.apply({ accepted: true })
        // A stream already running: video is open.
        internals.videoStreamOpen = true
    }

    return { plane, sent, internals, videoFrames: 0 }
}

/** An Annex-B access unit of `payloadBytes` bytes behind an IDR NAL. */
function keyFrame(payloadBytes: number): Uint8Array {
    const frame = new Uint8Array(5 + payloadBytes)
    frame.set([0, 0, 0, 1, 0x65])
    frame.fill(0x2a, 5)
    return frame
}

/** Feeds a frame and answers how many packets it went out as. */
function sendFrame(harness: Harness, frame: Uint8Array): number {
    const packets = harness.plane.sendVideoFrame(
        frame,
        harness.videoFrames * VIDEO_FRAME_INTERVAL_US
    )
    harness.videoFrames++
    return packets
}

/** A video packet from the peer, as it would arrive from the relay. */
function inboundVideoPacket(sequenceNumber: number): Uint8Array {
    const header = new RtpHeader(
        H264_PAYLOAD_TYPE,
        sequenceNumber,
        sequenceNumber * 3000,
        PEER_VIDEO_SSRC
    )
    header.marker = true
    return new RtpPacket(header, new Uint8Array([0x65, 0x88, 0x84])).encode()
}

/** The video packets among everything the relay received. */
function videoPackets(sent: readonly Uint8Array[]): RtpPacket[] {
    return sent
        .filter((packet) => (packet[0] & 0xc0) === 0x80 && (packet[1] & 0x7f) === H264_PAYLOAD_TYPE)
        .map((packet) => RtpPacket.decode(packet))
}

/** The elements of an extension, with the zero padding discarded. */
function parseElements(extension: Uint8Array): ExtensionElement[] {
    const elements: ExtensionElement[] = []
    let offset = 0
    while (offset < extension.length) {
        const head = extension[offset]
        if (head === 0) {
            offset++
            continue
        }
        const length = (head & 0x0f) + 1
        offset++
        elements.push({ id: head >>> 4, data: extension.subarray(offset, offset + length) })
        offset += length
    }
    return elements
}

/** The estimate element inside an extension, or `null` if it does not carry one. */
function estimateElement(extension: Uint8Array): ExtensionElement | null {
    return parseElements(extension).find((el) => el.id === WA_FAST_REMB_EXTENSION_ID) ?? null
}

/** The last estimate element among the video packets that went out. */
function lastEstimate(sent: readonly Uint8Array[]): ExtensionElement | null {
    let last: ExtensionElement | null = null
    for (const packet of videoPackets(sent)) {
        last = estimateElement(packet.header.extensionData) ?? last
    }
    return last
}

/**
 * The bandwidth the element announces, read as a plain three-byte big-endian
 * integer, behind the bitmap that opens the content. The width is checked
 * first, so that changing the encoding fails here with a message instead of
 * decoding bytes of another format as if they were these.
 */
function announcedBitrate(element: ExtensionElement): number {
    assert.equal(
        WA_FAST_REMB_BITRATE_ENCODING.byteLength,
        3,
        'this reader decodes a plain three-byte big endian integer'
    )
    return (element.data[1] << 16) | (element.data[2] << 8) | element.data[3]
}

test('carries the receiver estimate on the packet that opens a frame and on no other', async () => {
    const harness = await createPlane()
    const packets = sendFrame(harness, keyFrame(VIDEO_MAX_PAYLOAD * 3))

    assert.ok(packets > 1, 'the fixture frame has to span several packets')
    const sentPackets = videoPackets(harness.sent)
    assert.equal(sentPackets.length, packets)

    const carrying = sentPackets.filter((packet) => estimateElement(packet.header.extensionData))
    assert.equal(carrying.length, 1, 'one element per frame, as the official client sends it')
    assert.ok(
        estimateElement(sentPackets[0].header.extensionData),
        'and it is the packet that opens the frame'
    )
    harness.plane.stop()
})

/**
 * The extension without the new element has to come out exactly as it did
 * before the element existed. That is what separates adding an element from
 * rewriting the extension.
 */
test('a packet without the estimate carries the bytes it carried before', async () => {
    const harness = await createPlane()
    sendFrame(harness, keyFrame(VIDEO_MAX_PAYLOAD * 3))

    const continuation = videoPackets(harness.sent)[1]
    assert.deepEqual(continuation.header.extensionData, CONTINUATION_EXTENSION)

    const fresh = await createPlane()
    const withoutEstimate = fresh.internals.buildVideoExtension(true, true, 0, 0)
    assert.deepEqual(withoutEstimate, EXTENSION_WITHOUT_ESTIMATE)
    fresh.plane.stop()
    harness.plane.stop()
})

test('the elements that were already there survive the new one', async () => {
    const harness = await createPlane()
    sendFrame(harness, keyFrame(VIDEO_MAX_PAYLOAD * 3))

    const opening = videoPackets(harness.sent)[0].header.extensionData
    const before = parseElements(EXTENSION_WITHOUT_ESTIMATE)
    const after = parseElements(opening)

    assert.deepEqual(
        after.map((el) => el.id),
        [...before.map((el) => el.id), WA_FAST_REMB_EXTENSION_ID],
        'the estimate goes behind them, in ascending id order'
    )
    for (let index = 0; index < before.length; index++) {
        assert.deepEqual(after[index].data, before[index].data, `element ${before[index].id}`)
    }
    harness.plane.stop()
})

test('keeps the extension profile and the 32-bit alignment the wire already had', async () => {
    const harness = await createPlane()
    sendFrame(harness, keyFrame(VIDEO_MAX_PAYLOAD * 3))

    const raw = harness.sent[0]
    assert.equal(raw[0] & 0x10, 0x10, 'the header still flags an extension')
    assert.equal((raw[12] << 8) | raw[13], WA_RTP_EXTENSION_PROFILE)
    assert.deepEqual(raw.subarray(12, 14), new Uint8Array([0xde, 0xbe]))

    const extension = videoPackets(harness.sent)[0].header.extensionData
    assert.equal(extension.length % 4, 0)
    assert.equal((raw[14] << 8) | raw[15], extension.length / 4, 'the word count matches the bytes')
    harness.plane.stop()
})

/**
 * The announced value has to have the shape of what the peer announces:
 * hundreds of thousands, with tens of thousands arriving. If it came out
 * close to the incoming rate, the peer sender's ceiling would become the
 * rate it is already stuck at, and the extension would not have removed
 * anything.
 */
test('announces an order of magnitude above the rate that is arriving', async () => {
    const harness = await createPlane()
    sendFrame(harness, keyFrame(VIDEO_MAX_PAYLOAD))

    const element = lastEstimate(harness.sent)
    assert.ok(element)
    const announced = announcedBitrate(element)

    assert.ok(
        announced >= COLLAPSED_INBOUND_BITRATE * 10,
        `announced ${announced} against ${COLLAPSED_INBOUND_BITRATE} arriving`
    )
    assert.ok(announced >= 100_000, 'hundreds of thousands, like the value the peer announces')
    harness.plane.stop()
})

/**
 * The case that motivated all of this: the server turns off REMB over RTCP
 * in the offer itself, and this extension becomes the only path the estimate
 * leaves by. The ceiling has to keep climbing with what arrives, because it
 * is computed before the RTCP gate, not behind it.
 */
test('keeps announcing over rtp while the server has turned the rtcp remb off', async () => {
    const harness = await createPlane({
        rtcpIntervalMs: null,
        disableRtcpRemb: true,
        appDataSframe: false
    })

    sendFrame(harness, keyFrame(VIDEO_MAX_PAYLOAD))
    const opening = estimateElement(videoPackets(harness.sent)[0].header.extensionData)
    assert.ok(opening)
    const first = announcedBitrate(opening)

    for (let sequence = 1; sequence <= 6; sequence++) {
        harness.internals.onRelayData(inboundVideoPacket(sequence))
    }
    assert.equal(
        harness.sent.filter((packet) => packet[1] === 206).length,
        0,
        'the rtcp transport stays off, which is what the server asked for'
    )

    sendFrame(harness, keyFrame(VIDEO_MAX_PAYLOAD))
    const later = lastEstimate(harness.sent)
    assert.ok(later)
    assert.ok(
        announcedBitrate(later) > first,
        'the ceiling the extension carries climbed while the rtcp path was silent'
    )
    harness.plane.stop()
})

/**
 * The per-packet path must not allocate, and that includes the slice: two
 * builds of the same shape have to return the same object, and different
 * shapes have to view the same buffer with the right length.
 */
test('builds every extension in one buffer instead of allocating per packet', async () => {
    const harness = await createPlane()
    const opening = harness.internals.buildVideoExtension(true, true, 0, 300_000)
    const continuation = harness.internals.buildVideoExtension(true, false, 1, 0)
    const again = harness.internals.buildVideoExtension(true, false, 2, 0)

    assert.equal(opening.buffer, continuation.buffer, 'both are views over the session scratch')
    assert.equal(again, continuation, 'the same shape reuses the same slice')
    assert.equal(continuation.length, CONTINUATION_EXTENSION.length)
    const wordAligned = Math.ceil((EXTENSION_BASE_LENGTH + WA_FAST_REMB_ELEMENT_LENGTH) / 4) * 4
    assert.equal(
        opening.length,
        wordAligned,
        'the element goes in before the padding, not behind it'
    )
    harness.plane.stop()
})

/**
 * The padding has to be zeroed on every build: a short shape behind a long
 * one finds the buffer with the previous one's bytes, and RFC 8285 requires
 * zero there.
 */
test('zeroes the padding instead of inheriting the previous extension', async () => {
    const harness = await createPlane()
    harness.internals.buildVideoExtension(true, true, 0xffff, 300_000)
    const continuation = harness.internals.buildVideoExtension(true, false, 1, 0)

    assert.deepEqual(continuation, CONTINUATION_EXTENSION)
    harness.plane.stop()
})

/** A peer that gets our video before the accept never renders it for the whole call. */
test('no video leaves before the call is accepted', async () => {
    const harness = await createPlane(undefined, { accepted: false })

    assert.equal(sendFrame(harness, keyFrame(100)), 0)
    assert.equal(harness.sent.length, 0, 'nothing reached the relay')

    harness.plane.stop()
})

/** A delta: a non-IDR slice. */
function deltaFrame(payloadBytes: number): Uint8Array {
    const frame = new Uint8Array(5 + payloadBytes)
    frame.set([0, 0, 0, 1, 0x41])
    frame.fill(0x2a, 5)
    return frame
}

test('our video opens on a key frame, and then takes every frame', async () => {
    const harness = await createPlane(undefined, { accepted: false })
    await harness.plane.apply({ accepted: true })

    assert.equal(sendFrame(harness, deltaFrame(100)), 0, 'a delta cannot open the stream')
    assert.equal(harness.sent.length, 0)

    assert.ok(sendFrame(harness, keyFrame(100)) > 0, 'the first key frame opens it')
    assert.ok(sendFrame(harness, deltaFrame(100)) > 0, 'and deltas follow it')

    harness.plane.stop()
})
