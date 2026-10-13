import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    allocateCredentials,
    createHarness,
    dialOffer,
    dialWebRtcLeg,
    flush,
    isMedia,
    MEDIA,
    OFFER,
    REISSUE
} from './_relay-harness.js'

const WEBRTC_LEG_ID = `${REISSUE[0]}:3478#0`

/** Sends one media packet at `ms` and reports whether it went out. */
function sendAt(harness: Awaited<ReturnType<typeof dialWebRtcLeg>>, ms: number): boolean {
    harness.setNow(ms)
    return harness.relay.sendMedia(MEDIA.slice().buffer)
}

function stallWarnings(warnings: readonly string[]): string[] {
    return warnings.filter((message) => message.startsWith('relay downlink stalled'))
}

test('an accepted call with no downlink re-allocates its WebRTC legs after 5 s', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    assert.equal(sendAt(harness, 0), true)
    harness.dialled[0].channelSent.length = 0

    sendAt(harness, 4_999)
    assert.deepEqual(allocateCredentials(harness.dialled[0]), [], 'not before 5 s')

    sendAt(harness, 5_000)
    assert.equal(allocateCredentials(harness.dialled[0]).length, 1, 're-allocated at once')
    assert.equal(harness.dialled.length, 1, 'on the same connection')
    assert.deepEqual(stallWarnings(harness.warnings), ['relay downlink stalled, re-allocating'])
})

test('still no downlink 5 s after the re-allocate, the WebRTC legs are redialled', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    sendAt(harness, 0)
    sendAt(harness, 5_000)

    sendAt(harness, 9_999)
    assert.equal(harness.dialled.length, 1)
    sendAt(harness, 10_000)
    await flush()

    assert.equal(harness.dialled.length, 2, 'a new peer connection')
    assert.equal(harness.dialled[0].closed, true)
    assert.deepEqual(stallWarnings(harness.warnings), [
        'relay downlink stalled, re-allocating',
        'relay downlink stalled, redialling'
    ])
    harness.dialled[1].openChannel()
    assert.equal(sendAt(harness, 10_100), true, 'media resumes on the redialled leg')
    assert.equal(harness.dialled[1].channelSent.filter(isMedia).length, 1)
})

test('redials back off and stop at the limit of the call', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    sendAt(harness, 0)

    const redialAt: number[] = []
    for (let ms = 100; ms <= 200_000; ms += 100) {
        const before = harness.dialled.length
        sendAt(harness, ms)
        if (harness.dialled.length > before) {
            redialAt.push(ms)
            await flush()
            harness.dialled[harness.dialled.length - 1].openChannel()
        }
    }

    assert.deepEqual(redialAt, [10_000, 25_000, 50_000], '10 s, then 5 + 10 s, then 5 + 20 s')
})

test('authenticated peer media on a leg cancels the watchdog', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    sendAt(harness, 0)
    sendAt(harness, 4_000)
    harness.relay.notePeerMedia(WEBRTC_LEG_ID)

    for (let ms = 4_100; ms < 8_000; ms += 100) sendAt(harness, ms)

    assert.deepEqual(stallWarnings(harness.warnings), [], 'the stall restarted with the peer')
})

test('a peer heard only through its RTCP once a second keeps the watchdog quiet', async (t) => {
    const harness = await dialWebRtcLeg(t)
    harness.relay.setMediaFlowing()
    for (let ms = 0; ms <= 60_000; ms += 100) {
        if (ms % 1_000 === 0) harness.relay.notePeerMedia(WEBRTC_LEG_ID)
        sendAt(harness, ms)
    }

    assert.deepEqual(stallWarnings(harness.warnings), [])
    assert.equal(harness.dialled.length, 1)
})

test('before the call is accepted nothing is watched', async (t) => {
    const harness = await dialWebRtcLeg(t)
    for (let ms = 0; ms <= 30_000; ms += 100) sendAt(harness, ms)

    assert.deepEqual(stallWarnings(harness.warnings), [])
    assert.equal(harness.dialled.length, 1)
})

test('raw legs are left to their own return-path policy', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    harness.relay.setMediaFlowing()
    for (let ms = 0; ms <= 30_000; ms += 100) {
        harness.setNow(ms)
        harness.relay.sendMedia(MEDIA.slice().buffer)
    }

    assert.deepEqual(stallWarnings(harness.warnings), [])
    for (const ip of OFFER) assert.equal(harness.legsTo(ip).length, 1, `${ip} not redialled`)
})
