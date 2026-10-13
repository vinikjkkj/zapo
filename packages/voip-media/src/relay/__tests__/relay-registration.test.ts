import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    createHarness,
    debugContexts,
    dialOffer,
    dialReissue,
    dialWebRtcLeg,
    idOf,
    readStunAttribute,
    REISSUE,
    STUN_ALLOCATE,
    typeOf
} from './_relay-harness.js'

test('the allocate layout is logged per leg when it changes, as attribute types and lengths', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.resendSubscriptions()
    harness.relay.resendSubscriptions()

    const layoutsOf = (ip: string) =>
        debugContexts(harness, 'relay allocate layout')
            .filter((context) => context?.connectionId === idOf(ip))
            .map((context) => String(context?.attributes))
    const v4 = layoutsOf(REISSUE[0])
    const v6 = layoutsOf(REISSUE[1])
    assert.equal(v4.length, 1, 'repeats of the same allocate are not logged again')
    assert.match(v4[0], /^RELAY-CREDENTIAL:3,0x4024:\d+,0x0016:8,MESSAGE-INTEGRITY:20$/)
    assert.match(v6[0], /,0x0016:20,/)

    harness.relay.setSelfLayers([{ layer: 0, ssrcs: [0x11223344, 0x11223345] }])
    assert.equal(layoutsOf(REISSUE[0]).length, 2, 'a new descriptor is a new layout')
    assert.match(layoutsOf(REISSUE[0])[1], /^RELAY-CREDENTIAL:3,0x4024:\d+,/)
})

test('a WebRTC leg carries the rx subscriptions in its allocate, and re-announces a change', async (t) => {
    const { relay, dialled } = await dialWebRtcLeg(t)
    dialled[0].channelSent.length = 0

    relay.setRxSubscriptions(new Uint8Array([0x12, 0x02, 0x10, 0x02]))

    const allocates = dialled[0].channelSent.filter(
        (datagram) => typeOf(datagram) === STUN_ALLOCATE
    )
    assert.equal(allocates.length, 1, 'announced at once')
    assert.deepEqual(
        readStunAttribute(allocates[0], 0x4021),
        new Uint8Array([0x12, 0x02, 0x10, 0x02])
    )
})
