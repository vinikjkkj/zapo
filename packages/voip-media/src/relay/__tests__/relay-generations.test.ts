import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
    createHarness,
    dialOffer,
    dialReissue,
    endpoint,
    flush,
    idOf,
    isMedia,
    OFFER,
    REISSUE,
    STUN_ALLOCATE,
    typeOf,
    WA_PING
} from './_relay-harness.js'

test('a newer generation is dialled while the legs of the older one are open', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)

    await dialReissue(harness)

    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 1, `${ip} was dialled`)
    assert.equal(harness.relay.getConnectedCount(), 4)
    assert.deepEqual(harness.lost, [])
})

test('media moves to the newest generation and the older legs stay up without it', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await dialReissue(harness)
    for (let i = 0; i < 3; i++) assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    for (const ip of OFFER) harness.leg(ip).sent.length = 0
    harness.relay.setMediaFlowing()
    harness.relay.resendSubscriptions()
    for (const ip of OFFER) {
        const types = harness.leg(ip).sent.map(typeOf)
        assert.ok(types.includes(WA_PING), `${ip} keeps its keepalive`)
        assert.ok(types.includes(STUN_ALLOCATE), `${ip} keeps its registration`)
        assert.equal(harness.leg(ip).sent.filter(isMedia).length, 0, `${ip} got no media`)
    }
})

test('media stays on an older leg while the newest generation dials, then moves', async (t) => {
    const harness = createHarness(t, { held: [...REISSUE] })
    await dialOffer(harness)
    await dialReissue(harness)

    assert.equal(harness.sendMediaVia()?.ip, OFFER[0], 'no gap while the new legs dial')
    harness.leg(REISSUE[1]).release()
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1], 'the first newest leg to open takes it')
    harness.leg(REISSUE[0]).release()
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1], 'and keeps it')
    assert.deepEqual(harness.warnings, [], 'dialling is not a degraded path')
})

test('peer media on an older leg does not pull the media back within the hold', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    harness.setNow(300)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    harness.relay.notePeerMedia(idOf(OFFER[1]))

    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'the newest generation keeps the send')
})

test('once the newest generation hears the peer, older legs are gone and cannot pull back', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))

    harness.setNow(5_000)
    harness.relay.notePeerMedia(idOf(OFFER[0]))

    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
    for (const ip of OFFER) assert.equal(harness.legsTo(ip)[0].closed, true, `${ip} retired`)
})

test('peer media on a newest leg takes the media off an older leg at once', async (t) => {
    const harness = createHarness(t, { held: [...REISSUE] })
    await dialOffer(harness)
    harness.relay.notePeerMedia(idOf(OFFER[0]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).release()
    harness.setNow(50)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))

    assert.equal(
        harness.sendMediaVia()?.ip,
        REISSUE[1],
        'the leg that hears the peer, not the hold'
    )
})

test('within the newest generation the peer is followed after the 400 ms hold', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    harness.relay.notePeerMedia(idOf(REISSUE[0]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    harness.setNow(300)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0], 'held while the leg heard the peer')

    harness.setNow(500)
    harness.relay.notePeerMedia(idOf(REISSUE[1]))
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[1])
})

test('with every newest leg gone, media falls back to an older leg and says so once', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])

    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    const fallbacks = harness.warnings.filter((message) => message.includes('falls back'))
    assert.equal(fallbacks.length, 1, 'one warning for the transition, none per packet')
    assert.deepEqual(harness.lost, [])

    harness.relay.notePeerMedia(idOf(OFFER[1]))
    assert.equal(harness.sendMediaVia()?.ip, OFFER[1], 'the fallback follows the peer as 1:1 does')
})

test('redialling the newest generation takes the media back from the fallback', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)
    for (const ip of REISSUE) harness.leg(ip).fail('raw_udp_no_return_path')
    assert.equal(harness.sendMediaVia()?.ip, OFFER[0])

    await dialReissue(harness)

    assert.equal(harness.legsTo(REISSUE[0]).length, 2, 'redialled under the same generation')
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
})

test('a batch of an older generation is ignored', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness, 2)

    await harness.relay.configureRelays([endpoint('10.9.0.1')], { generation: 1 })
    await flush()

    assert.equal(harness.legsTo('10.9.0.1').length, 0)
    assert.equal(harness.sendMediaVia()?.ip, REISSUE[0])
})

test('relays of an older generation are not redialled once a newer one is configured', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    harness.leg(OFFER[1]).fail('raw_udp_no_return_path')

    await dialReissue(harness)
    await dialReissue(harness)

    assert.equal(harness.legsTo(OFFER[1]).length, 1, 'the dead offer leg stayed dead')
    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 1, `${ip} dialled once`)
})

test('a batch with no generation keeps the current one and dials only relays with no leg', async (t) => {
    const harness = createHarness(t)
    await dialOffer(harness)
    await dialReissue(harness)

    await harness.relay.configureRelays([
        ...REISSUE.map((ip) => endpoint(ip, { transport: 'raw-udp' })),
        endpoint('10.1.0.2', { transport: 'raw-udp' })
    ])
    await flush()

    for (const ip of REISSUE) assert.equal(harness.legsTo(ip).length, 1, `${ip} not redialled`)
    assert.equal(harness.legsTo('10.1.0.2').length, 1)
    harness.leg(REISSUE[0]).fail('raw_udp_no_return_path')
    harness.leg(REISSUE[1]).fail('raw_udp_no_return_path')
    assert.equal(
        harness.sendMediaVia()?.ip,
        '10.1.0.2',
        'the added relay is of the newest generation'
    )
})
