import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    allocateCredentials,
    ATTR_RELAY_CREDENTIAL,
    createHarness,
    debugContexts,
    dialOffer,
    dialWebRtcLeg,
    endpoint,
    flush,
    idOf,
    isMedia,
    MEDIA,
    OFFER,
    readStunAttribute,
    REISSUE,
    STUN_ALLOCATE,
    typeOf
} from './_relay-harness.js'

test('an address re-issued with the same credentials keeps its leg in the new generation', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await harness.relay.configureRelays(
        [endpoint(OFFER[1], { relayId: 2 }), endpoint(REISSUE[0])],
        {
            generation: 1
        }
    )
    await flush()

    assert.equal(harness.legsTo(OFFER[1]).length, 1, 'not redialled')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'it is a leg of the newest generation now')
})

test('an address re-issued with new credentials is re-registered on the same raw socket', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays([endpoint(OFFER[0], { token: 'old' })])
    await flush()
    const [leg] = harness.legsTo(OFFER[0])
    leg.sent.length = 0

    const fresh = new Uint8Array([9, 8, 7, 6])
    await harness.relay.configureRelays(
        [endpoint(OFFER[0], { token: 'new', rawToken: fresh, transport: 'raw-udp' })],
        { generation: 1 }
    )
    await flush()

    assert.deepEqual(harness.legsTo(OFFER[0]), [leg], 'no new socket for the same address')
    assert.equal(leg.closed, false)
    const allocate = leg.sent.find((datagram) => typeOf(datagram) === STUN_ALLOCATE)
    assert.ok(allocate, 'the leg registered again at once')
    assert.deepEqual(readStunAttribute(allocate, ATTR_RELAY_CREDENTIAL), fresh)
    assert.deepEqual(harness.lost, [])
    assert.equal(harness.relay.getConnectedCount(), 1)
    assert.equal(harness.sendMediaVia(), leg, 'the leg is of the newest generation')
})

/** A re-issue that keeps the address and changes only the token (the same `token_id` flip). */
test('a newer generation that changes only the token re-allocates on the same socket', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const harness = createHarness(t, { rawUdpLegs: 'required' })
    harness.relay.setSsrc(0x11223344)
    const reissued = (rawToken: Uint8Array, token: string) => ({
        ...endpoint(REISSUE[0], { transport: 'raw-udp', rawToken, token }),
        authTokenId: '0'
    })
    const first = new Uint8Array(194).fill(0x13)
    const second = new Uint8Array(187).fill(0x14)
    await harness.relay.configureRelays([reissued(first, 'tid-13')], { generation: 1 })
    await flush()
    const [leg] = harness.legsTo(REISSUE[0])
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    leg.sent.length = 0

    await harness.relay.configureRelays([reissued(second, 'tid-14')], { generation: 2 })
    await flush()
    t.mock.timers.tick(3_000)
    harness.relay.resendSubscriptions()

    assert.deepEqual(harness.legsTo(REISSUE[0]), [leg], 'the 5-tuple is kept')
    const credentials = leg.sent
        .filter((datagram) => typeOf(datagram) === STUN_ALLOCATE)
        .map((allocate) => readStunAttribute(allocate, ATTR_RELAY_CREDENTIAL))
    assert.ok(credentials.length >= 2, 'the reissue and its replays went out')
    for (const credential of credentials) {
        assert.deepEqual(credential, second, 'no allocate carries the old token after the reissue')
    }
    assert.deepEqual(harness.lost, [])
    assert.equal(harness.sendMediaVia(), leg)
})

test('a change of address still opens a new socket', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays([endpoint(OFFER[0])])
    await flush()

    await harness.relay.configureRelays([endpoint(REISSUE[0], { token: 'new' })], {
        generation: 1
    })
    await flush()

    assert.equal(harness.legsTo(REISSUE[0]).length, 1)
    assert.equal(harness.legsTo(OFFER[0])[0].closed, false, 'the older leg waits for retirement')
})

test('a WebRTC leg whose ICE credentials stay re-allocates over its data channel', async (t) => {
    const { relay, dialled, descriptor } = await dialWebRtcLeg(t)
    const fresh = new Uint8Array(187).fill(0x14)
    dialled[0].channelSent.length = 0
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true)

    await relay.configureRelays([descriptor('ufrag-13', fresh)], { generation: 2 })
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true, 'no gap in the send')
    await flush()
    t.mock.timers.tick(3_000)

    assert.equal(dialled[0].channelSent.filter(isMedia).length, 2, 'both on the same channel')

    assert.equal(dialled.length, 1, 'no new peer connection')
    assert.equal(dialled[0].closed, false)
    const credentials = allocateCredentials(dialled[0])
    assert.ok(credentials.length >= 2, 'the reissue and its replays went out on the channel')
    for (const credential of credentials) assert.deepEqual(credential, fresh)
})

test('a WebRTC leg whose auth token rotates keeps its connection and re-allocates', async (t) => {
    const { relay, dialled, descriptor, warnings, infos } = await dialWebRtcLeg(t)
    const fresh = new Uint8Array(187).fill(0x14)
    dialled[0].channelSent.length = 0
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true)

    await relay.configureRelays([descriptor('ufrag-14', fresh)], { generation: 2 })
    assert.equal(relay.sendMedia(MEDIA.slice().buffer), true, 'no gap in the send')
    await flush()
    t.mock.timers.tick(3_000)

    assert.equal(dialled.length, 1, 'the peer connection is kept')
    assert.equal(dialled[0].closed, false)
    assert.equal(dialled[0].channelSent.filter(isMedia).length, 2, 'both on the same channel')
    const credentials = allocateCredentials(dialled[0])
    assert.ok(credentials.length >= 2, 'the reissue and its replays went out on the channel')
    for (const credential of credentials) assert.deepEqual(credential, fresh)
    assert.deepEqual(warnings, [])

    const [message, context] = infos[0] ?? []
    assert.equal(message, 'relay ice credential rotated, kept the connection')
    assert.match(String(context?.from), /^[0-9a-f]{8}$/)
    assert.match(String(context?.to), /^[0-9a-f]{8}$/)
    assert.notEqual(context?.from, context?.to)
    assert.ok(!JSON.stringify(context).includes('ufrag-1'), 'never the credential itself')
})

test('a WebRTC leg whose relay key changes is redialled with a warning', async (t) => {
    const { relay, dialled, descriptor, warnings } = await dialWebRtcLeg(t)

    await relay.configureRelays(
        [descriptor('ufrag-13', new Uint8Array(187).fill(0x14), { key: 'other-key' })],
        { generation: 2 }
    )
    await flush()

    assert.equal(dialled.length, 2, 'a new peer connection for the new key')
    assert.equal(dialled[0].closed, true)
    assert.deepEqual(warnings, ['relay ice credentials changed at the same address, redialling'])
})

test('a WebRTC leg whose auth token id changes at the same address is redialled with a warning', async (t) => {
    const { relay, dialled, descriptor, warnings } = await dialWebRtcLeg(t)

    await relay.configureRelays(
        [descriptor('ufrag-14', new Uint8Array(187).fill(0x14), { authTokenId: '1' })],
        { generation: 2 }
    )
    await flush()

    assert.equal(dialled.length, 2)
    assert.equal(dialled[0].closed, true, 'the old connection is not left behind')
    assert.deepEqual(warnings, ['relay ice credentials changed at the same address, redialling'])
})

test('a raw leg whose auth token id changes at the same address keeps its socket', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays([{ ...endpoint(REISSUE[0]), authTokenId: '0' }])
    await flush()
    const [leg] = harness.legsTo(REISSUE[0])

    await harness.relay.configureRelays(
        [{ ...endpoint(REISSUE[0], { token: 'next' }), authTokenId: '1' }],
        { generation: 1 }
    )
    await flush()

    assert.deepEqual(harness.legsTo(REISSUE[0]), [leg])
    assert.equal(leg.closed, false)
    assert.equal(harness.sendMediaVia(), leg)
})

test('a rebind keeps the leg elected for media, with no gap in the send', async (t) => {
    const harness = createHarness(t)
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays(OFFER.map((ip, i) => endpoint(ip, { relayId: i + 1 })))
    await flush()
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    const elected = harness.sendMediaVia()
    assert.equal(elected?.ip, OFFER[1])
    const electionsBefore = debugContexts(harness, 'sctp media leg elected').length

    const rebinding = harness.relay.configureRelays(
        OFFER.map((ip, i) =>
            endpoint(ip, { relayId: i + 1, token: 'next', rawToken: new Uint8Array([7, 7, 7]) })
        ),
        { generation: 1 }
    )
    assert.equal(harness.sendMediaVia(), elected, 'during the rebind')
    await rebinding
    await flush()
    assert.equal(harness.sendMediaVia(), elected, 'after the rebind')

    assert.equal(harness.legs.length, 2, 'no leg was redialled')
    assert.equal(debugContexts(harness, 'sctp media leg elected').length, electionsBefore)
    assert.deepEqual(harness.infos, [], 'a rebound leg is not retired')
})
