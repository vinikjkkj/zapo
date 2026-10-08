import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { readUInt32BE } from '../../bytes.js'
import { createNoopLogger } from '../../logger.js'
import type { RtpPacket } from '../../media/rtp.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { WaCallMediaPlanUpdate, WaCallMediaSsrcs } from '../plan.js'
import {
    decodeCallMediaMessage,
    encodeCallMediaMessage,
    WA_CALL_MEDIA_WIRE_VERSION,
    type WaCallMediaMessage,
    WaCallMediaReceiver
} from '../remote.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

const CALL_ID = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const SELF_AUDIO = 0x11111111
const SELF_VIDEO = 0x22222222
const PEER_AUDIO = 0x33333333
const PEER_VIDEO = 0x44444444

const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO,
    selfVideo: SELF_VIDEO,
    selfAppData: 0x55555555,
    selfStreams: [SELF_AUDIO],
    selfVideoStreams: [SELF_VIDEO],
    peerAudio: PEER_AUDIO,
    peerStreams: [PEER_AUDIO],
    peerVideoStreams: [PEER_VIDEO],
    peerAppData: []
}

/** One Annex-B access unit each, small enough to go out as a single packet. */
const KEY_FRAME = new Uint8Array([0, 0, 0, 1, 0x65, 0x88, 0x84, 0x00])
const DELTA_FRAME = new Uint8Array([0, 0, 0, 1, 0x41, 0x9a, 0x02, 0x00])

const HELD = { send: true, receive: true, sendHeld: true } as const
const RELEASED = { send: true, receive: true } as const

/** A relay that is always up and keeps what the plane hands it. */
class FakeRelay {
    readonly sent: Uint8Array[] = []
    /** Our streams as last registered. */
    selfStreams: number[] = []

    setSsrc(): void {}
    setSubscriptionSsrc(): void {}
    setStreamSsrcs(selfSsrcs: number[]): void {
        this.selfStreams = [...selfSsrcs]
    }
    setParticipantIds(): void {}
    resendSubscriptions(): void {}
    async configureRelays(): Promise<void> {}
    hasConnection(): boolean {
        return true
    }
    getConnectedCount(): number {
        return 1
    }
    setMediaFlowing(): void {}
    sendMedia(data: ArrayBuffer): boolean {
        this.sent.push(new Uint8Array(data))
        return true
    }
    cleanup(): void {}
}

interface PlaneInternals {
    sctpRelay: FakeRelay
    srtpSession: { protect: (packet: RtpPacket) => Uint8Array }
}

/** Puts a relay that keeps everything under the plane, and SRTP that leaves packets as built. */
function wire(plane: WaCallMediaPlane): FakeRelay {
    const relay = new FakeRelay()
    ;(plane as unknown as PlaneInternals).sctpRelay = relay
    return relay
}

function stubSrtp(plane: WaCallMediaPlane): void {
    ;(plane as unknown as PlaneInternals).srtpSession = { protect: (packet) => packet.encode() }
}

/** The RTP packets of our video stream the relay took. */
function videoPackets(relay: FakeRelay): number {
    return relay.sent.filter(
        (data) => (data[1] < 200 || data[1] > 207) && readUInt32BE(data, 8) === SELF_VIDEO
    ).length
}

/** A flowing plane on a call negotiated as `mediaType`. */
async function createFlowingPlane(
    mediaType: 'audio' | 'video'
): Promise<{ plane: WaCallMediaPlane; relay: FakeRelay }> {
    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })
    const relay = wire(plane)
    await plane.apply({ mediaType, ssrcs: SSRCS })
    stubSrtp(plane)
    await plane.apply({ accepted: true })
    assert.equal(plane.isFlowing, true)
    return { plane, relay }
}

test('a held sender drops every frame, and opens on the first key frame once let go', async () => {
    const { plane, relay } = await createFlowingPlane('audio')

    await plane.apply({ video: HELD })

    assert.ok(
        relay.selfStreams.includes(SELF_VIDEO),
        'the hold keeps the frames back, not the relay registration of the stream'
    )
    assert.equal(plane.sendVideoFrame(KEY_FRAME, 1_000), 0)
    assert.equal(plane.sendVideoFrame(DELTA_FRAME, 67_000), 0)
    assert.equal(videoPackets(relay), 0)

    await plane.apply({ video: RELEASED })

    assert.equal(plane.sendVideoFrame(DELTA_FRAME, 133_000), 0, 'nothing decodes a delta first')
    assert.equal(plane.sendVideoFrame(KEY_FRAME, 200_000), 1)
    assert.equal(plane.sendVideoFrame(DELTA_FRAME, 267_000), 1)
    assert.equal(videoPackets(relay), 2)
    assert.equal(plane.getStats().videoFramesSent, 2)
    plane.stop()
})

/** A section is replaced whole, so a later one that says nothing of a hold has none. */
test('a video section without the hold lets the video go', async () => {
    const { plane, relay } = await createFlowingPlane('audio')

    await plane.apply({ video: HELD })
    await plane.apply({ video: { send: true, receive: false } })

    assert.equal(plane.sendVideoFrame(KEY_FRAME, 1_000), 1)
    assert.equal(videoPackets(relay), 1)
    plane.stop()
})

test('a hold on a stream already out closes it, so it opens again on a key frame', async () => {
    const { plane, relay } = await createFlowingPlane('video')
    assert.equal(plane.sendVideoFrame(KEY_FRAME, 1_000), 1)
    assert.equal(plane.sendVideoFrame(DELTA_FRAME, 67_000), 1)

    await plane.apply({ video: HELD })
    assert.equal(plane.sendVideoFrame(KEY_FRAME, 133_000), 0)
    assert.equal(plane.sendVideoFrame(DELTA_FRAME, 200_000), 0)
    await plane.apply({ video: RELEASED })

    assert.equal(plane.sendVideoFrame(DELTA_FRAME, 267_000), 0)
    assert.equal(plane.sendVideoFrame(KEY_FRAME, 333_000), 1)
    assert.equal(videoPackets(relay), 3)
    plane.stop()
})

/** The hold has to survive the text form a remote host receives the plan in. */
test('a host carrying the media elsewhere holds and lets go the same way', async () => {
    const receiver = new WaCallMediaReceiver({
        callId: CALL_ID,
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled,
        send: () => {}
    })
    const relay = wire(receiver.plane)
    let seq = 0
    const receive = (plan: WaCallMediaPlanUpdate): Promise<void> => {
        const message: WaCallMediaMessage = {
            v: WA_CALL_MEDIA_WIRE_VERSION,
            callId: CALL_ID,
            seq,
            full: seq === 0,
            plan
        }
        seq++
        return receiver.receive(decodeCallMediaMessage(encodeCallMediaMessage(message)))
    }

    await receive({ mediaType: 'audio', ssrcs: SSRCS })
    stubSrtp(receiver.plane)
    await receive({ accepted: true })
    await receive({ video: HELD })

    assert.equal(receiver.plane.sendVideoFrame(KEY_FRAME, 1_000), 0)

    await receive({ video: RELEASED })

    assert.equal(receiver.plane.sendVideoFrame(KEY_FRAME, 67_000), 1)
    assert.equal(videoPackets(relay), 1)
    receiver.stop()
})
