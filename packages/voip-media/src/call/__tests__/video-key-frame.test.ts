import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { readUInt32BE } from '../../bytes.js'
import { createNoopLogger } from '../../logger.js'
import { RtpHeader, RtpPacket, RtpSession } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { InboundVideoFrame } from '../../types.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const SELF_VIDEO_SSRC = 0x22222222
const PEER_VIDEO_SSRC = 0x44444444
const SECOND_PEER_VIDEO_SSRC = 0x55555555

const IDR = new Uint8Array([0x65, 0x88, 0x84])
const DELTA = new Uint8Array([0x41, 0x9a, 0x02])
/** The official client's key frame: one FU-A typed SPS, the PPS and the IDR inside it. */
const SPS_TYPED_KEY_FRAME = new Uint8Array([
    0x7c, 0xc7, 0x42, 0xc0, 0, 0, 0, 1, 0x68, 0xce, 0, 0, 0, 1, 0x65, 0x88, 0x84
])

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly frames: InboundVideoFrame[]
    /** Media SSRCs of the picture loss indications sent (FMT 1 under the 0x10 profile bit). */
    readonly keyFrameRequests: () => number[]
    readonly push: (ssrc: number, payload: Uint8Array) => void
}

/** A video plane with pass-through SRTP and SRTCP and a relay that keeps what it sends. */
async function createPlane(): Promise<Harness> {
    const sent: Uint8Array[] = []
    const frames: InboundVideoFrame[] = []
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        onInboundVideo: (frame) => {
            frames.push(frame)
        }
    })
    await plane.apply({ mediaType: 'video' })

    const internals = plane as unknown as Record<string, unknown>
    internals.sctpRelay = {
        sendMedia: (data: ArrayBuffer) => {
            sent.push(new Uint8Array(data))
            return true
        },
        hasConnection: () => true,
        cleanup: () => {},
        setSubscriptionSsrc: () => {},
        resendSubscriptions: () => {}
    }
    internals.srtpSession = { unprotect: (data: Uint8Array) => RtpPacket.decode(data) }
    internals.srtcpContext = { protect: (rtcp: Uint8Array) => rtcp }
    internals.videoRtpSession = new RtpSession(SELF_VIDEO_SSRC, 97)

    const sequences = new Map<number, number>()
    return {
        plane,
        frames,
        keyFrameRequests: () =>
            sent
                .filter((packet) => packet[1] === 206 && (packet[0] & 0x0f) === 1)
                .map((packet) => readUInt32BE(packet, 8)),
        push: (ssrc, payload) => {
            const sequence = (sequences.get(ssrc) ?? 0) + 1
            sequences.set(ssrc, sequence)
            const header = new RtpHeader(97, sequence, sequence * 3000, ssrc)
            header.marker = true
            ;(internals.onRelayData as (data: Uint8Array) => void).call(
                plane,
                new RtpPacket(header, payload).encode()
            )
        }
    }
}

test('a second video stream asks for its own key frame after the first got one', async () => {
    const harness = await createPlane()

    harness.push(PEER_VIDEO_SSRC, IDR)
    harness.push(SECOND_PEER_VIDEO_SSRC, DELTA)
    harness.push(PEER_VIDEO_SSRC, DELTA)

    assert.deepEqual(harness.keyFrameRequests(), [SECOND_PEER_VIDEO_SSRC])
    harness.plane.stop()
})

test('one stream asking for a key frame holds back another only for the plane-wide gap', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
    const harness = await createPlane()

    harness.push(PEER_VIDEO_SSRC, DELTA)
    harness.push(SECOND_PEER_VIDEO_SSRC, DELTA)
    assert.deepEqual(harness.keyFrameRequests(), [PEER_VIDEO_SSRC])

    t.mock.timers.tick(40)
    harness.push(SECOND_PEER_VIDEO_SSRC, DELTA)
    harness.push(PEER_VIDEO_SSRC, DELTA)

    assert.deepEqual(harness.keyFrameRequests(), [PEER_VIDEO_SSRC, SECOND_PEER_VIDEO_SSRC])
    harness.plane.stop()
})

test('a burst of new SSRCs draws no more key frame requests than eight streams would', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 })
    const harness = await createPlane()

    for (let index = 0; index < 300; index++) {
        harness.push(0x60000000 + index, DELTA)
        t.mock.timers.tick(1)
    }

    const requests = harness.keyFrameRequests().length
    assert.ok(requests > 0 && requests <= 8, `${requests} requests within 300 ms`)
    harness.plane.stop()
})

test("the official client's key frame stops the key frame requests", async () => {
    const harness = await createPlane()

    harness.push(PEER_VIDEO_SSRC, SPS_TYPED_KEY_FRAME)
    harness.push(PEER_VIDEO_SSRC, DELTA)

    assert.equal(harness.frames[0].keyFrame, true)
    assert.deepEqual(harness.keyFrameRequests(), [])
    harness.plane.stop()
})
