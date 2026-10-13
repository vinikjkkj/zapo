import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    createHarness,
    debugContexts,
    dialOffer,
    dialReissue,
    endpoint,
    flush,
    idOf,
    OFFER,
    REISSUE
} from './_relay-harness.js'

/** A STUN allocate success response: class success, method allocate, no attributes. */
const ALLOCATE_SUCCESS = new Uint8Array([
    0x01,
    0x03,
    0x00,
    0x00,
    0x21,
    0x12,
    0xa4,
    0x42,
    ...new Uint8Array(12)
])

const RETIRED = 'retired by a newer relay generation'

test('authenticated peer media on a newest leg retires every older leg for good', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    const older = OFFER.map((ip) => harness.leg(ip))

    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    assert.deepEqual(
        older.map((leg) => leg.closed),
        [true, true]
    )
    assert.deepEqual(harness.infos, [RETIRED, RETIRED], 'one line per retired leg')
    assert.equal(harness.relay.getConnectedCount(), 2, 'the retired legs gave their count back')
    assert.deepEqual(harness.lost, [])

    for (const leg of older) leg.sent.length = 0
    harness.relay.setMediaFlowing()
    harness.relay.resendSubscriptions()
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    assert.deepEqual(
        older.map((leg) => leg.sent.length),
        [0, 0],
        'no keepalive, registration or media reaches a retired leg'
    )
})

test('a newest generation that answers the allocate but hears no media retires nothing, and the peer is followed back', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).deliver(ALLOCATE_SUCCESS)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the newest generation is tried first')

    harness.setNow(399)
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'not before the hold')

    harness.setNow(400)
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'the leg that hears the peer')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'and keeps it while it hears')
    assert.deepEqual(harness.infos, [], 'nothing retired on an allocate answer')
    for (const ip of OFFER) assert.equal(harness.leg(ip).closed, false)
})

test('peer media arriving later on the newest generation takes the send, older legs retire once quiet', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    harness.setNow(2_000)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))

    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1])
    assert.equal(harness.legsTo(OFFER[1])[0].closed, true, 'the leg that never heard the peer')
    assert.equal(harness.legsTo(OFFER[0])[0].closed, false, 'heard the peer 1.5 s ago')

    harness.setNow(5_500)
    harness.sendMediaVia()
    assert.equal(harness.legsTo(OFFER[0])[0].closed, true, 'retired once quiet for 5 s')
    assert.deepEqual(harness.infos, [RETIRED, RETIRED])
})

/** The P3 shape: one sender still delivered by an older relay while the newest delivers another. */
test('an older leg still hearing another sender outlives the proof of the newest generation', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(OFFER[1]))

    harness.setNow(100)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    assert.equal(harness.legsTo(OFFER[0])[0].closed, true, 'never heard anyone: retired')
    assert.equal(harness.legsTo(OFFER[1])[0].closed, false, 'still delivering a sender: kept')
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the send stays on the newest generation')
})

test('an older leg that keeps hearing its sender is kept receive-only for as long as it hears', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(OFFER[1]))
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    const kept = harness.legsTo(OFFER[1])[0]

    for (let ms = 0; ms <= 20_000; ms += 100) {
        harness.setNow(ms)
        harness.relay.notePeerMedia(idOf(OFFER[1]))
        assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], `the send stays newest at ${ms} ms`)
    }
    assert.equal(kept.closed, false)

    harness.setNow(25_100)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    assert.equal(kept.closed, true, 'quiet for 5 s, then retired')
})

test('an older leg that stops hearing the peer gives the send back to the newest generation', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    harness.setNow(900)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the newest generation stays preferred')
})

test('an offer relay outside the conference never pulls the send off the re-issued one', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    harness.setNow(10_000)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'silence on every leg moves nothing')
    harness.relay.notePeerMedia(idOf(REISSUE[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1])
    for (const ip of OFFER) assert.equal(harness.legsTo(ip)[0].closed, true, `${ip} retired`)
})

test('losing the newest generation while an older leg hears the peer does not lose the call', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).deliver(ALLOCATE_SUCCESS)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(OFFER[0]))

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')

    assert.deepEqual(harness.lost, [], 'the older generation still carries the call')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])
})

test('pongs on the newest legs and peer media on an older one retire nothing', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.setMediaFlowing()
    await flush()

    harness.relay.notePeerMedia(idOf(OFFER[0]))
    harness.leg(OFFER[1]).deliver(ALLOCATE_SUCCESS)

    for (const ip of OFFER) assert.equal(harness.leg(ip).closed, false, `${ip} kept`)
    assert.deepEqual(harness.infos, [])
})

test('an older leg still dialling when the newest generation proves itself is cancelled', async (t) => {
    const harness = createHarness(t, { held: [OFFER[1]] })
    harness.relay.setSsrc(0x11223344)
    await harness.relay.configureRelays(OFFER.map((ip, i) => endpoint(ip, { relayId: i + 1 })))
    await flush()
    await dialReissue(harness)

    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    const dialling = harness.legsTo(OFFER[1])[0]
    assert.equal(dialling.closed, true, 'the dial was abandoned')

    dialling.release()
    assert.equal(
        harness.relay.getConnectedCount(),
        2,
        'a late open of the cancelled leg counts nothing'
    )
    assert.deepEqual(harness.lost, [])
})

test('a WebRTC leg still negotiating when the newest generation proves itself is cancelled', async (t) => {
    let resolveFactory: (pc: RTCPeerConnection) => void = () => {}
    let lateClosed = false
    const harness = createHarness(t, {
        rawUdpLegs: 'required',
        createPeerConnection: () =>
            new Promise<RTCPeerConnection>((resolve) => {
                resolveFactory = resolve
            })
    })
    harness.relay.setSsrc(0x11223344)
    const offerDial = harness.relay.configureRelays([{ ...endpoint(OFFER[0]), originalPort: 3480 }])
    await dialReissue(harness)

    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    await offerDial
    resolveFactory({
        close: () => {
            lateClosed = true
        }
    } as unknown as RTCPeerConnection)
    await flush()
    assert.equal(lateClosed, true, 'the peer connection resolved after the cancel is closed')
    assert.deepEqual(harness.infos, [RETIRED])
})

test('with the newest legs lost after the retirement, no older relay is redialled', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')

    assert.equal(harness.sendMediaVia(), null, 'nothing reopens the offer relays')
    assert.deepEqual(harness.lost, ['raw_udp_no_return_path'])
    assert.equal(
        harness.warnings.filter((message) => message.includes('falls back')).length,
        0,
        'no fallback is announced once the older legs are gone'
    )

    await harness.relay.configureRelays(
        OFFER.map((ip) => endpoint(ip)),
        { generation: 0 }
    )
    await dialReissue(harness)

    for (const ip of OFFER) assert.equal(harness.legsTo(ip).length, 1, `${ip} never redialled`)
    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 2, `${ip} redialled`)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
})

test('a call with a single generation never retires a leg', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)

    harness.relay.notePeerMedia(idOf(OFFER[0]))
    harness.leg(OFFER[1]).deliver(ALLOCATE_SUCCESS)
    harness.leg(OFFER[0]).deliver(ALLOCATE_SUCCESS)

    for (const ip of OFFER) assert.equal(harness.leg(ip).closed, false, `${ip} kept`)
    assert.equal(harness.relay.getConnectedCount(), 2)
    assert.deepEqual(harness.infos, [])
})

/** A relay that answers pings and never the allocate: the leg is answered, nothing is proved. */
test('a leg answered only by pongs says so, retires nothing, and its loss falls back', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)

    const answered = debugContexts(harness, 'relay leg answered').filter(
        (context) => context?.connectionId === idOf(REISSUE[0])
    )
    assert.match(String(answered[0]?.firstPacket), /wa-pong/)
    assert.deepEqual(harness.infos, [], 'a pong is no proof of the newest relays')

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0], 'the unretired offer leg takes the media')
    assert.ok(harness.warnings.some((message) => message.includes('falls back')))
})
