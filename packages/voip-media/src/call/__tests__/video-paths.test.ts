import assert from 'node:assert/strict'
import { test } from 'node:test'

import { peerConnectionNotDialled } from '../../__tests__/_helpers.js'
import { createNoopLogger } from '../../logger.js'
import { nodeCrypto } from '../../node/crypto.js'
import type { WaCallMediaSsrcs } from '../plan.js'
import { WaCallMediaPlane } from '../WaCallMediaPlane.js'

/** SSRCs of one peer device copied from a capture's logs, not recomputed. */
/** Audio slot 0 of that device on that call, from the same capture. */
const PEER_AUDIO_MAIN_SSRC = 0x8ffe17b1
/** Video slot 2 of the same device on the same call. */
const PEER_VIDEO_MAIN_SSRC = 0xeb15721e
/** The device's FEC and NACK video streams; placeholders, the tests only count them. */
const PEER_VIDEO_FEC_SSRC = 0x44444444
const PEER_VIDEO_OOB_NACK_SSRC = 0x55555555

const SELF_AUDIO_SSRC = 0x11111111
const SELF_VIDEO_SSRC = 0x22222222
const SELF_APP_DATA_SSRC = 0x33333333

/**
 * The plan after the peer answered: the peer's audio stream is subscribed, and
 * its video streams are known but not subscribed.
 */
const SSRCS: WaCallMediaSsrcs = {
    selfAudio: SELF_AUDIO_SSRC,
    selfVideo: SELF_VIDEO_SSRC,
    selfAppData: SELF_APP_DATA_SSRC,
    selfStreams: [SELF_AUDIO_SSRC],
    selfVideoStreams: [SELF_VIDEO_SSRC],
    peerAudio: PEER_AUDIO_MAIN_SSRC,
    peerStreams: [PEER_AUDIO_MAIN_SSRC],
    peerVideoStreams: [PEER_VIDEO_MAIN_SSRC, PEER_VIDEO_FEC_SSRC, PEER_VIDEO_OOB_NACK_SSRC],
    peerAppData: []
}

interface SubscriptionUpdate {
    readonly selfSsrcs: readonly number[]
    readonly peerSsrcs: readonly number[]
}

interface PlaneInternals {
    videoRtpSession: { getSsrc: () => number } | null
    sctpRelay: {
        setSsrc: (ssrc: number) => void
        setSubscriptionSsrc: (ssrc: number) => void
        setStreamSsrcs: (selfSsrcs: number[], peerSsrcs: number[]) => void
        resendSubscriptions: () => void
        cleanup: () => void
    }
}

interface Harness {
    readonly plane: WaCallMediaPlane
    readonly subscriptions: SubscriptionUpdate[]
    readonly resendCount: () => number
    readonly internals: PlaneInternals
}

/**
 * A plane wired up the way it would be after the peer answered: the peer's audio
 * stream is subscribed, no video stream exists, and the relay is inert.
 */
async function createPlane(mediaType: 'audio' | 'video' = 'audio'): Promise<Harness> {
    const subscriptions: SubscriptionUpdate[] = []
    let resends = 0

    const plane = new WaCallMediaPlane({
        logger: createNoopLogger(),
        crypto: nodeCrypto,
        createPeerConnection: peerConnectionNotDialled
    })

    const internals = plane as unknown as PlaneInternals
    internals.sctpRelay = {
        setSsrc: () => {},
        setSubscriptionSsrc: () => {},
        setStreamSsrcs: (selfSsrcs, peerSsrcs) => {
            subscriptions.push({ selfSsrcs: [...selfSsrcs], peerSsrcs: [...peerSsrcs] })
        },
        resendSubscriptions: () => {
            resends++
        },
        cleanup: () => {}
    }

    await plane.apply({ mediaType, ssrcs: SSRCS })
    // The plan's audio subscription is setup; only what video adds is counted.
    subscriptions.length = 0
    resends = 0

    return {
        plane,
        subscriptions,
        resendCount: () => resends,
        internals
    }
}

/** What signaling applies on a peer `<video>` state: its video may now arrive. */
function videoState(plane: WaCallMediaPlane): Promise<void> {
    return plane.apply({ video: { send: false, receive: true } })
}

test('the first video state subscribes the peer video slots and opens a video rtp session', async () => {
    const harness = await createPlane()

    await videoState(harness.plane)

    assert.equal(harness.subscriptions.length, 1)
    const peerSsrcs = harness.subscriptions[0].peerSsrcs
    assert.ok(
        peerSsrcs.includes(PEER_AUDIO_MAIN_SSRC),
        'the audio stream stays subscribed after the upgrade'
    )
    assert.ok(
        peerSsrcs.includes(PEER_VIDEO_MAIN_SSRC),
        `expected the peer video slot 0x${PEER_VIDEO_MAIN_SSRC.toString(16)} in the subscription`
    )
    assert.equal(peerSsrcs.length, 4, 'the three video slots join the one audio slot')
    assert.equal(harness.resendCount(), 1)
    assert.notEqual(harness.internals.videoRtpSession, null)

    harness.plane.stop()
})

test('the video receive path opens once, not on every video state', async () => {
    const harness = await createPlane()

    await videoState(harness.plane)
    await videoState(harness.plane)
    await videoState(harness.plane)

    assert.equal(harness.subscriptions.length, 1)
    assert.equal(harness.resendCount(), 1)

    harness.plane.stop()
})

test('a call negotiated as video keeps the subscription it already has', async () => {
    const harness = await createPlane('video')

    await videoState(harness.plane)

    assert.equal(harness.subscriptions.length, 0)
    assert.equal(harness.resendCount(), 0)

    harness.plane.stop()
})
